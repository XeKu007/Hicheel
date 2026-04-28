import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

const globalForProm = globalThis as typeof globalThis & {
  _promRegistry?: Registry;
  _promMetrics?: {
    httpRequestCount: Counter;
    httpRequestDuration: Histogram;
    dbConnectionCount: Gauge;
    redisCacheHitRate: Gauge;
    memoryUsageMb: Gauge;
  };
};

if (!globalForProm._promRegistry) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  globalForProm._promRegistry = registry;
  globalForProm._promMetrics = {
    httpRequestCount: new Counter({
      name: "http_requests_total",
      help: "Total HTTP requests",
      labelNames: ["route", "status_code"],
      registers: [registry],
    }),
    httpRequestDuration: new Histogram({
      name: "http_request_duration_ms",
      help: "HTTP request duration in milliseconds",
      labelNames: ["route"],
      buckets: [10, 50, 100, 200, 500, 1000],
      registers: [registry],
    }),
    dbConnectionCount: new Gauge({
      name: "db_connections_active",
      help: "Active database connections",
      registers: [registry],
    }),
    redisCacheHitRate: new Gauge({
      name: "redis_cache_hit_rate",
      help: "Redis cache hit rate (0-1)",
      registers: [registry],
    }),
    memoryUsageMb: new Gauge({
      name: "memory_usage_mb",
      help: "Current memory usage in megabytes",
      registers: [registry],
      collect() {
        this.set(process.memoryUsage().heapUsed / 1024 / 1024);
      },
    }),
  };
}

export const metrics = globalForProm._promMetrics!;
export const promRegistry = globalForProm._promRegistry!;
