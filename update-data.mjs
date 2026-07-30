#!/usr/bin/env node
/**
 * data/earnings.json 실데이터 갱신 스크립트 (Node 22+, 의존성 없음).
 *
 * Yahoo Finance quoteSummary(crumb 인증)에서 종목별로
 *  - calendarEvents  → 다음 실적 발표일 + 확정/예상 여부
 *  - earningsTrend   → 당분기 EPS·매출 컨센서스
 *  - earningsHistory → 최근 4개 분기 실제 vs 컨센 (서프라이즈)
 * 를 받아 병합한다.
 *
 * 실패 종목은 기존 JSON 값을 유지한다(데이터가 절대 비지 않음).
 * GitHub Actions에서 매일 실행 → 변경 시 커밋 (.github/workflows/update-data.yml)
 *
 * 사용: node scripts/update-data.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = join(ROOT, 'earnings.json');

/** 유니버스 — 표시용 메타는 여기서 관리(수동), 수치는 Yahoo에서 자동. */
const UNIVERSE = [
  { symbol: 'AAPL', code: 'AAPL', name: '애플', market: 'US', exchange: '나스닥', currency: 'USD', color: '#111111', logo: 'A' },
  { symbol: 'MSFT', code: 'MSFT', name: '마이크로소프트', market: 'US', exchange: '나스닥', currency: 'USD', color: '#00A4EF', logo: 'M' },
  { symbol: 'GOOGL', code: 'GOOGL', name: '알파벳', market: 'US', exchange: '나스닥', currency: 'USD', color: '#4285F4', logo: 'G' },
  { symbol: 'META', code: 'META', name: '메타', market: 'US', exchange: '나스닥', currency: 'USD', color: '#0668E1', logo: 'M' },
  { symbol: 'NVDA', code: 'NVDA', name: '엔비디아', market: 'US', exchange: '나스닥', currency: 'USD', color: '#76B900', logo: 'N' },
  { symbol: 'TSLA', code: 'TSLA', name: '테슬라', market: 'US', exchange: '나스닥', currency: 'USD', color: '#E31937', logo: 'T' },
  { symbol: 'AMZN', code: 'AMZN', name: '아마존', market: 'US', exchange: '나스닥', currency: 'USD', color: '#FF9900', logo: 'a', logoText: '#111111' },
  { symbol: 'NFLX', code: 'NFLX', name: '넷플릭스', market: 'US', exchange: '나스닥', currency: 'USD', color: '#E50914', logo: 'N' },
  { symbol: 'TSM', code: 'TSM', name: 'TSMC', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#A31F34', logo: 'T' },
  { symbol: 'ASML', code: 'ASML', name: 'ASML', market: 'US', exchange: '나스닥', currency: 'USD', color: '#0F238C', logo: 'A' },
  { symbol: 'CPNG', code: 'CPNG', name: '쿠팡', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#C73336', logo: 'C' },
  { symbol: '005930.KS', code: '005930', name: '삼성전자', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#1428A0', logo: '삼' },
  { symbol: '000660.KS', code: '000660', name: 'SK하이닉스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#EC1C24', logo: 'S' },
  { symbol: '035420.KS', code: '035420', name: '네이버', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#03C75A', logo: 'N' },
  { symbol: '035720.KS', code: '035720', name: '카카오', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#FEE500', logo: '카', logoText: '#3C1E1E' },
  { symbol: '005380.KS', code: '005380', name: '현대차', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#002C5F', logo: '현' },
  { symbol: '000270.KS', code: '000270', name: '기아', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#05141F', logo: '기' },
  { symbol: '373220.KS', code: '373220', name: 'LG에너지솔루션', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#A50034', logo: 'L' },
  { symbol: '068270.KS', code: '068270', name: '셀트리온', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00857C', logo: '셀' },
  { symbol: '005490.KS', code: '005490', name: 'POSCO홀딩스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#2AA8E0', logo: 'P' },
];

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Yahoo crumb 세션 (쿠키 + crumb) */
async function getSession() {
  const r1 = await fetch('https://fc.yahoo.com/', { headers: UA, redirect: 'manual' });
  const setCookie = r1.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  if (!cookie) throw new Error('yahoo cookie 획득 실패');
  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...UA, cookie },
  });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes('<')) throw new Error('yahoo crumb 획득 실패');
  return { cookie, crumb };
}

async function quoteSummary(session, symbol) {
  const modules = 'calendarEvents,earningsTrend,earningsHistory';
  for (const host of ['query2', 'query1']) {
    const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol
    )}?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}`;
    try {
      const res = await fetch(url, { headers: { ...UA, cookie: session.cookie } });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (result) return result;
    } catch {
      // 다음 호스트 재시도
    }
  }
  return null;
}

const raw = (v) => (typeof v?.raw === 'number' ? v.raw : typeof v === 'number' ? v : null);

function quarterLabel(fmt) {
  // "2026-06-30" → "2026 2Q"
  const [y, m] = fmt.split('-').map(Number);
  return `${y} ${Math.ceil(m / 3)}Q`;
}

function revenueText(currency, v) {
  if (v == null) return null;
  if (currency === 'USD') {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    return `$${Math.round(v / 1e6)}M`;
  }
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
  return `${Math.round(v / 1e8).toLocaleString('ko-KR')}억원`;
}

function parseStock(meta, prev, qs) {
  const cal = qs?.calendarEvents?.earnings;
  const dates = (cal?.earningsDate ?? []).map((d) => d?.fmt).filter(Boolean);
  const nextDate = dates[0] ?? prev?.next?.date ?? null;
  const confirmed =
    cal?.isEarningsDateEstimate != null ? cal.isEarningsDateEstimate === false : (prev?.next?.confirmed ?? false);

  const trend = (qs?.earningsTrend?.trend ?? []).find((t) => t?.period === '0q');
  const eps = raw(trend?.earningsEstimate?.avg) ?? prev?.next?.epsConsensus ?? null;
  const rev = raw(trend?.revenueEstimate?.avg);
  const revText = rev != null ? revenueText(meta.currency, rev) : (prev?.next?.revenueText ?? null);

  const hist = (qs?.earningsHistory?.history ?? [])
    .map((h) => {
      const fmt = h?.quarter?.fmt;
      const actual = raw(h?.epsActual);
      const consensus = raw(h?.epsEstimate);
      if (!fmt || actual == null || consensus == null) return null;
      return { q: quarterLabel(fmt), date: fmt, actual, consensus };
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!nextDate) return null;
  return {
    ...meta,
    next: {
      date: nextDate,
      session: prev?.next?.session ?? (meta.market === 'KR' ? 'bmo' : 'amc'),
      confirmed,
      epsConsensus: eps,
      revenueText: revText,
    },
    history: hist.length > 0 ? hist : (prev?.history ?? []),
  };
}

function todayKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  let prev = { asOf: '', stocks: [] };
  try {
    prev = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  } catch {
    // 최초 실행
  }
  const prevBySym = new Map(prev.stocks.map((s) => [s.symbol, s]));

  const session = await getSession();
  console.log('yahoo session OK');

  const stocks = [];
  let updated = 0;
  for (const meta of UNIVERSE) {
    const old = prevBySym.get(meta.symbol);
    const qs = await quoteSummary(session, meta.symbol);
    const parsed = qs ? parseStock(meta, old, qs) : null;
    if (parsed) {
      stocks.push(parsed);
      updated++;
      console.log(`OK   ${meta.symbol.padEnd(10)} next=${parsed.next.date} eps=${parsed.next.epsConsensus ?? '-'} hist=${parsed.history.length}`);
    } else if (old) {
      stocks.push(old);
      console.log(`KEEP ${meta.symbol} (fetch 실패 — 기존 값 유지)`);
    } else {
      console.log(`SKIP ${meta.symbol} (데이터 없음)`);
    }
    await sleep(350);
  }

  if (updated === 0) {
    console.error('갱신된 종목이 없어 파일을 쓰지 않습니다.');
    process.exitCode = 1;
    return;
  }

  const out = { asOf: todayKST(), stocks };
  writeFileSync(DATA_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\ndata/earnings.json 갱신 완료 — ${updated}/${UNIVERSE.length}종목, asOf=${out.asOf}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
