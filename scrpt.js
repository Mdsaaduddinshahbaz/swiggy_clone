import http from 'k6/http';
import { check } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        // { duration: '3m', target: 100 },
        // { duration: '30s', target: 150 },
        // { duration: '1m', target: 150 },
        { duration: '30s', target: 0 },
    ],

    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<500'],
    },
};

const BASE_URL = 'http://127.0.0.1:8000';

export default function () {
    const res = http.get(`${BASE_URL}/ping`);

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response is ok': (r) => r.body === 'ok',
    });

    // Detailed timing for every request
    console.log(
        `status=${res.status} ` +
        `total=${res.timings.duration.toFixed(2)}ms ` +
        `blocked=${res.timings.blocked.toFixed(2)}ms ` +
        `connecting=${res.timings.connecting.toFixed(2)}ms ` +
        `tls=${res.timings.tls_handshaking.toFixed(2)}ms ` +
        `sending=${res.timings.sending.toFixed(2)}ms ` +
        `waiting=${res.timings.waiting.toFixed(2)}ms ` +
        `receiving=${res.timings.receiving.toFixed(2)}ms`
    );
}