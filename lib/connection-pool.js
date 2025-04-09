var debug = require('debug')('memcache-plus:connection-pool');

var Connection = require('./connection');

function selectConn(pool) {
  // Find the least busy connection
  let leastBusyConn = -1;
  let lowestBufSize = Number.MAX_SAFE_INTEGER;
  for (let x = 0; x < pool.length; x++) {
    const connBufSize = pool[x].commandBuffer.size + Math.random();
    if (pool[x].ready && lowestBufSize > connBufSize) {
      leastBusyConn = x;
      lowestBufSize = connBufSize;
    }
  }
  return leastBusyConn;
}


function ConnectionPool(opts) {
  // Initialise the pool
  this.pool = [];
  const poolSize = opts.poolSize || 1;
  debug('Creating a connection pool with %d connections', poolSize);
  for (let x = 0; x < poolSize; x++ ) {
    this.pool.push(new Connection(opts));
  }

  // Methods to which we need to select a single connection
  [
    'autodiscovery', 'set', 'cas', 'incr', 'decr',
    'gets', 'get', 'flush_all', 'add', 'replace', 'append',
    'prepend', 'delete', 'version',
  ].forEach((method) => {
    this[method] = (...args) => {
      const connIdx = selectConn(this.pool);
      debug('Least busy connection to \'%s:%d\' for a \'%s\': %s', opts.host, opts.port, method, connIdx);
      const conn = this.pool[connIdx];
      return conn[method].apply(conn, args);
    };
  });

  // Methods to which we'll broadcast the operations
  [
    'disconnect', 'destroy', 'connect', 'flushBuffer'
  ].forEach((method) => {
    this[method] = (...args) => {
      this.pool.forEach(conn => conn[method].apply(conn, args));
    };    
  });

  // Methods that we are not implementing here on purpose (because they don't apply)
  [
    'write', 'read'
  ].forEach((method) => {
    this[method] = () => {
      throw new Error(`Method '${method}' not implemented in connection pools`);
    };
  });

  // TODO: We could make this event-driven
  setInterval(() => {
    this.ready = !!this.pool.find(conn => conn.ready);
  }, 100);

  return this;
}

module.exports = ConnectionPool;
