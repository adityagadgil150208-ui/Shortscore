'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { createApp } = require('../server');

// This is an intentionally unusable fixture. Tests never contact a live AI API.
const TEST_API_KEY = 'test-key-not-a-real-credential';
const reportInput = {
  ticker: 'ACME',
  company_name: 'Acme Example Company',
  short_seller: 'Example Research',
  raw_text: 'The author alleges that Acme recorded distributor sales before customers paid. The excerpt cites a receivables table, but does not include the company response or independently verified evidence.'
};

function summaryFixture(overrides = {}) {
  return {
    classification: 'Questions about when sales are recorded',
    executive_summary: [
      'The report alleges that some sales were recorded too early.',
      'The excerpt points to unpaid customer invoices as supporting evidence.',
      'These are allegations; the excerpt does not establish that they are true.'
    ],
    smoking_gun: 'The author cites a receivables table. The full filing and company response need checking.',
    primary_claims: [{
      claim: 'The author questions the timing of recorded sales.',
      metric_disputed: 'Unpaid customer invoices; no verified amount supplied.',
      severity: 'Medium'
    }],
    what_to_check: [
      'Read the full company filing referenced by the report.',
      'Find and compare the company response.',
      'Check whether the cited invoices were subsequently paid.'
    ],
    key_terms: [{ term: 'Receivables', definition: 'Money customers owe a company for sales already recorded.' }],
    ...overrides
  };
}

function providerResponse(summary = summaryFixture()) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(summary) } }] });
}

async function startApp(t, options = {}) {
  const app = createApp({
    apiKey: TEST_API_KEY,
    fetchImpl: async () => { throw new Error('Unexpected provider request in this test'); },
    ...options
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    get: path => fetch(`${origin}${path}`),
    analyze: input => fetch(`${origin}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }),
    request: (path, init) => fetch(`${origin}${path}`, init)
  };
}

test('health identifies whether analysis is configured without revealing the key', async t => {
  const client = await startApp(t);
  const response = await client.get('/api/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.analysis_available, true);
  assert.ok(!JSON.stringify(body).includes(TEST_API_KEY));
});

test('the public page loads while backend, dependency, and secret files stay private', async t => {
  const client = await startApp(t);
  const home = await client.get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /shortscope/i);
  for (const path of ['/server.js', '/.env', '/package.json', '/package-lock.json']) {
    const response = await client.get(path);
    assert.equal(response.status, 404, `${path} must not be served`);
  }
});

test('built-in reports are explicitly labeled as examples', async t => {
  const client = await startApp(t);
  const response = await client.get('/api/campaigns');
  assert.equal(response.status, 200);
  const campaigns = await response.json();
  assert.equal(campaigns.length, 4);
  for (const campaign of campaigns) {
    assert.equal(campaign.is_example, true);
    assert.equal(typeof campaign.source_note, 'string');
    assert.match(campaign.source_note, /example|sample|illustrat|educat/i);
    assert.ok(Array.isArray(campaign.executive_summary));
  }
});

test('invalid input is rejected before making a provider request', async t => {
  let calls = 0;
  const client = await startApp(t, { fetchImpl: async () => { calls++; return providerResponse(); } });
  const invalidInputs = [
    {},
    { ...reportInput, ticker: 'ACME<script>' },
    { ...reportInput, ticker: 42 },
    { ...reportInput, raw_text: 'Too short.' },
    { ...reportInput, raw_text: 'a'.repeat(40001) },
    { ...reportInput, raw_text: { text: reportInput.raw_text } },
    { ...reportInput, company_name: 'a'.repeat(121) },
    { ...reportInput, short_seller: ['not', 'text'] }
  ];
  for (const input of invalidInputs) {
    const response = await client.analyze(input);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(calls, 0);
});

test('malformed JSON returns an understandable error', async t => {
  const client = await startApp(t);
  const response = await client.request('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"ticker":'
  });
  assert.equal(response.status, 400);
  assert.equal(typeof (await response.json()).error, 'string');
});

test('missing API configuration is explicit and does not fabricate a report', async t => {
  let calls = 0;
  const client = await startApp(t, {
    apiKey: '',
    fetchImpl: async () => { calls++; return providerResponse(); }
  });
  const health = await (await client.get('/api/health')).json();
  assert.equal(health.analysis_available, false);
  const before = await (await client.get('/api/campaigns')).json();
  const response = await client.analyze(reportInput);
  assert.equal(response.status, 503);
  assert.equal(typeof (await response.json()).error, 'string');
  assert.equal(calls, 0);
  assert.deepEqual(await (await client.get('/api/campaigns')).json(), before);
});

test('a successful analysis uses the supplied report and protects user-supplied metadata', async t => {
  const calls = [];
  const fixture = summaryFixture({
    ticker: 'WRONG', company_name: 'Wrong company', short_seller: 'Wrong author',
    id: 'provider-controlled-id', is_example: true, date_dropped: '1900-01-01'
  });
  const client = await startApp(t, {
    fetchImpl: async (url, init) => { calls.push({ url, init }); return providerResponse(fixture); }
  });
  const response = await client.analyze({ ...reportInput, ticker: ' acme ' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ticker, 'ACME');
  assert.equal(body.company_name, reportInput.company_name);
  assert.equal(body.short_seller, reportInput.short_seller);
  assert.equal(body.is_example, false);
  assert.notEqual(body.id, fixture.id);
  assert.equal(body.date_dropped, null);
  assert.ok(!Number.isNaN(Date.parse(body.analyzed_at)));
  assert.deepEqual(body.executive_summary, fixture.executive_summary);
  assert.deepEqual(body.primary_claims, fixture.primary_claims);
  assert.deepEqual(body.what_to_check, fixture.what_to_check);
  assert.deepEqual(body.key_terms, fixture.key_terms);
  assert.equal(typeof body.source_note, 'string');
  assert.ok(!JSON.stringify(body).includes(TEST_API_KEY));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), `Bearer ${TEST_API_KEY}`);
  const sent = JSON.parse(calls[0].init.body);
  assert.ok(sent.messages.some(message => message.role === 'user' && message.content.includes(reportInput.raw_text)));
  const campaigns = await (await client.get('/api/campaigns')).json();
  assert.equal(campaigns.length, 5);
  assert.deepEqual(campaigns[0], body);
});

test('a ticker-only report uses a transparent company and author fallback', async t => {
  const client = await startApp(t, { fetchImpl: async () => providerResponse() });
  const response = await client.analyze({ ticker: 'ACME', raw_text: reportInput.raw_text });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.company_name, 'ACME (company name not provided)');
  assert.equal(body.short_seller, 'Report author not provided');
});

test('unusable provider output returns an error and creates no report', async t => {
  for (const content of ['not JSON', '{}', JSON.stringify(summaryFixture({ executive_summary: [] }))]) {
    await t.test(`rejects ${content === 'not JSON' ? 'non-JSON output' : content === '{}' ? 'missing fields' : 'incomplete summaries'}`, async subtest => {
      const client = await startApp(subtest, {
        fetchImpl: async () => Response.json({ choices: [{ message: { content } }] })
      });
      const before = await (await client.get('/api/campaigns')).json();
      const response = await client.analyze(reportInput);
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(typeof body.error, 'string');
      assert.equal(body.executive_summary, undefined);
      assert.deepEqual(await (await client.get('/api/campaigns')).json(), before);
    });
  }
});

test('provider errors stay private and do not invent results', async t => {
  const providerDetail = 'private-provider-detail-that-must-not-reach-the-browser';
  const client = await startApp(t, {
    fetchImpl: async () => Response.json({ error: { message: providerDetail } }, { status: 500 })
  });
  const before = await (await client.get('/api/campaigns')).json();
  const response = await client.analyze(reportInput);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.ok(!JSON.stringify(body).includes(providerDetail));
  assert.ok(!JSON.stringify(body).includes(TEST_API_KEY));
  assert.equal(body.executive_summary, undefined);
  assert.deepEqual(await (await client.get('/api/campaigns')).json(), before);
});

test('a provider timeout returns a recoverable error without a fabricated report', async t => {
  const client = await startApp(t, {
    fetchImpl: async () => { throw new DOMException('Mock timeout', 'TimeoutError'); }
  });
  const before = await (await client.get('/api/campaigns')).json();
  const response = await client.analyze(reportInput);
  assert.equal(response.status, 504);
  assert.equal(typeof (await response.json()).error, 'string');
  assert.deepEqual(await (await client.get('/api/campaigns')).json(), before);
});
