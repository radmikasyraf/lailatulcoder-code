/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { ValueType } from '@opentelemetry/api';
import { SERVICE_NAME } from './constants.js';
import { getMeter } from './metrics.js';
const DAEMON_EVENT_LOOP_LAG = `${SERVICE_NAME}.daemon.event_loop.lag`;
const ACP_EVENT_LOOP_LAG = `${SERVICE_NAME}.acp.event_loop.lag`;
let daemonGaugeRegistered = false;
let acpGaugeRegistered = false;
export function registerDaemonEventLoopLagGauge(read) {
    if (daemonGaugeRegistered)
        return;
    daemonGaugeRegistered = registerEventLoopLagGauge(DAEMON_EVENT_LOOP_LAG, read);
}
export function registerAcpEventLoopLagGauge(read) {
    if (acpGaugeRegistered)
        return;
    acpGaugeRegistered = registerEventLoopLagGauge(ACP_EVENT_LOOP_LAG, read);
}
function registerEventLoopLagGauge(name, read) {
    const meter = getMeter();
    if (!meter)
        return false;
    meter
        .createObservableGauge(name, {
        description: 'Event loop lag in milliseconds.',
        unit: 'ms',
        valueType: ValueType.DOUBLE,
    })
        .addCallback((result) => {
        try {
            const snapshot = read();
            result.observe(snapshot.meanMs, { stat: 'mean' });
            result.observe(snapshot.p50Ms, { stat: 'p50' });
            result.observe(snapshot.p99Ms, { stat: 'p99' });
            result.observe(snapshot.maxMs, { stat: 'max' });
        }
        catch {
            /* no-op */
        }
    });
    return true;
}
//# sourceMappingURL=event-loop-lag-metrics.js.map