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

const ROOT = dirname(fileURLToPath(import.meta.url));
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
  { symbol: 'AVGO', code: 'AVGO', name: '브로드컴', market: 'US', exchange: '나스닥', currency: 'USD', color: '#1F5FDB', logo: '브' },
  { symbol: 'AMD', code: 'AMD', name: 'AMD', market: 'US', exchange: '나스닥', currency: 'USD', color: '#D92B3C', logo: 'A' },
  { symbol: 'INTC', code: 'INTC', name: '인텔', market: 'US', exchange: '나스닥', currency: 'USD', color: '#12A03C', logo: '인' },
  { symbol: 'QCOM', code: 'QCOM', name: '퀄컴', market: 'US', exchange: '나스닥', currency: 'USD', color: '#E06E0A', logo: '퀄' },
  { symbol: 'MU', code: 'MU', name: '마이크론', market: 'US', exchange: '나스닥', currency: 'USD', color: '#6132CE', logo: '마' },
  { symbol: 'TXN', code: 'TXN', name: '텍사스인스트루먼트', market: 'US', exchange: '나스닥', currency: 'USD', color: '#0B72B8', logo: '텍' },
  { symbol: 'ORCL', code: 'ORCL', name: '오라클', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00867C', logo: '오' },
  { symbol: 'CRM', code: 'CRM', name: '세일즈포스', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#B0323F', logo: '세' },
  { symbol: 'ADBE', code: 'ADBE', name: '어도비', market: 'US', exchange: '나스닥', currency: 'USD', color: '#2E3FC8', logo: '어' },
  { symbol: 'IBM', code: 'IBM', name: 'IBM', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#7A5C00', logo: 'I' },
  { symbol: 'CSCO', code: 'CSCO', name: '시스코', market: 'US', exchange: '나스닥', currency: 'USD', color: '#C2185B', logo: '시' },
  { symbol: 'PLTR', code: 'PLTR', name: '팔란티어', market: 'US', exchange: '나스닥', currency: 'USD', color: '#00695C', logo: '팔' },
  { symbol: 'SNOW', code: 'SNOW', name: '스노우플레이크', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#4527A0', logo: '스' },
  { symbol: 'UBER', code: 'UBER', name: '우버', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#AD1457', logo: '우' },
  { symbol: 'ABNB', code: 'ABNB', name: '에어비앤비', market: 'US', exchange: '나스닥', currency: 'USD', color: '#283593', logo: '에' },
  { symbol: 'SHOP', code: 'SHOP', name: '쇼피파이', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00838F', logo: '쇼' },
  { symbol: 'PYPL', code: 'PYPL', name: '페이팔', market: 'US', exchange: '나스닥', currency: 'USD', color: '#EF6C00', logo: '페' },
  { symbol: 'COIN', code: 'COIN', name: '코인베이스', market: 'US', exchange: '나스닥', currency: 'USD', color: '#5D4037', logo: '코' },
  { symbol: 'HOOD', code: 'HOOD', name: '로빈후드', market: 'US', exchange: '나스닥', currency: 'USD', color: '#455A64', logo: '로' },
  { symbol: 'JPM', code: 'JPM', name: 'JP모건', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#827717', logo: 'J' },
  { symbol: 'BAC', code: 'BAC', name: '뱅크오브아메리카', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#1F5FDB', logo: '뱅' },
  { symbol: 'GS', code: 'GS', name: '골드만삭스', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#D92B3C', logo: '골' },
  { symbol: 'MS', code: 'MS', name: '모건스탠리', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#12A03C', logo: '모' },
  { symbol: 'C', code: 'C', name: '씨티그룹', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#E06E0A', logo: '씨' },
  { symbol: 'WFC', code: 'WFC', name: '웰스파고', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#6132CE', logo: '웰' },
  { symbol: 'BLK', code: 'BLK', name: '블랙록', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#0B72B8', logo: '블' },
  { symbol: 'V', code: 'V', name: '비자', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00867C', logo: '비' },
  { symbol: 'MA', code: 'MA', name: '마스터카드', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#B0323F', logo: '마' },
  { symbol: 'AXP', code: 'AXP', name: '아메리칸익스프레스', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#2E3FC8', logo: '아' },
  { symbol: 'BRK-B', code: 'BRK-B', name: '버크셔해서웨이', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#7A5C00', logo: '버' },
  { symbol: 'WMT', code: 'WMT', name: '월마트', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#C2185B', logo: '월' },
  { symbol: 'COST', code: 'COST', name: '코스트코', market: 'US', exchange: '나스닥', currency: 'USD', color: '#00695C', logo: '코' },
  { symbol: 'TGT', code: 'TGT', name: '타겟', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#4527A0', logo: '타' },
  { symbol: 'HD', code: 'HD', name: '홈디포', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#AD1457', logo: '홈' },
  { symbol: 'MCD', code: 'MCD', name: '맥도날드', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#283593', logo: '맥' },
  { symbol: 'SBUX', code: 'SBUX', name: '스타벅스', market: 'US', exchange: '나스닥', currency: 'USD', color: '#00838F', logo: '스' },
  { symbol: 'KO', code: 'KO', name: '코카콜라', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#EF6C00', logo: '코' },
  { symbol: 'PEP', code: 'PEP', name: '펩시코', market: 'US', exchange: '나스닥', currency: 'USD', color: '#5D4037', logo: '펩' },
  { symbol: 'PG', code: 'PG', name: 'P&G', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#455A64', logo: 'P' },
  { symbol: 'JNJ', code: 'JNJ', name: '존슨앤드존슨', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#827717', logo: '존' },
  { symbol: 'PFE', code: 'PFE', name: '화이자', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#1F5FDB', logo: '화' },
  { symbol: 'MRK', code: 'MRK', name: '머크', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#D92B3C', logo: '머' },
  { symbol: 'LLY', code: 'LLY', name: '일라이릴리', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#12A03C', logo: '일' },
  { symbol: 'ABBV', code: 'ABBV', name: '애브비', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#E06E0A', logo: '애' },
  { symbol: 'UNH', code: 'UNH', name: '유나이티드헬스', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#6132CE', logo: '유' },
  { symbol: 'XOM', code: 'XOM', name: '엑슨모빌', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#0B72B8', logo: '엑' },
  { symbol: 'CVX', code: 'CVX', name: '셰브론', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00867C', logo: '셰' },
  { symbol: 'BA', code: 'BA', name: '보잉', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#B0323F', logo: '보' },
  { symbol: 'CAT', code: 'CAT', name: '캐터필러', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#2E3FC8', logo: '캐' },
  { symbol: 'GE', code: 'GE', name: 'GE에어로스페이스', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#7A5C00', logo: 'G' },
  { symbol: 'LMT', code: 'LMT', name: '록히드마틴', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#C2185B', logo: '록' },
  { symbol: 'DIS', code: 'DIS', name: '디즈니', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00695C', logo: '디' },
  { symbol: 'CMCSA', code: 'CMCSA', name: '컴캐스트', market: 'US', exchange: '나스닥', currency: 'USD', color: '#4527A0', logo: '컴' },
  { symbol: 'T', code: 'T', name: 'AT&T', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#AD1457', logo: 'A' },
  { symbol: 'VZ', code: 'VZ', name: '버라이즌', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#283593', logo: '버' },
  { symbol: 'NKE', code: 'NKE', name: '나이키', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00838F', logo: '나' },
  { symbol: 'LULU', code: 'LULU', name: '룰루레몬', market: 'US', exchange: '나스닥', currency: 'USD', color: '#EF6C00', logo: '룰' },
  { symbol: 'MRVL', code: 'MRVL', name: '마벨테크놀로지', market: 'US', exchange: '나스닥', currency: 'USD', color: '#5D4037', logo: '마' },
  { symbol: 'ARM', code: 'ARM', name: 'Arm홀딩스', market: 'US', exchange: '나스닥', currency: 'USD', color: '#455A64', logo: 'A' },
  { symbol: 'SMCI', code: 'SMCI', name: '슈퍼마이크로', market: 'US', exchange: '나스닥', currency: 'USD', color: '#827717', logo: '슈' },
  { symbol: 'DELL', code: 'DELL', name: '델테크놀로지스', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#1F5FDB', logo: '델' },
  { symbol: 'INTU', code: 'INTU', name: '인튜이트', market: 'US', exchange: '나스닥', currency: 'USD', color: '#D92B3C', logo: '인' },
  { symbol: 'NOW', code: 'NOW', name: '서비스나우', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#12A03C', logo: '서' },
  { symbol: 'PANW', code: 'PANW', name: '팔로알토네트웍스', market: 'US', exchange: '나스닥', currency: 'USD', color: '#E06E0A', logo: '팔' },
  { symbol: 'CRWD', code: 'CRWD', name: '크라우드스트라이크', market: 'US', exchange: '나스닥', currency: 'USD', color: '#6132CE', logo: '크' },
  { symbol: 'NET', code: 'NET', name: '클라우드플레어', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#0B72B8', logo: '클' },
  { symbol: 'DDOG', code: 'DDOG', name: '데이터독', market: 'US', exchange: '나스닥', currency: 'USD', color: '#00867C', logo: '데' },
  { symbol: 'MDB', code: 'MDB', name: '몽고DB', market: 'US', exchange: '나스닥', currency: 'USD', color: '#B0323F', logo: '몽' },
  { symbol: 'SOFI', code: 'SOFI', name: '소파이', market: 'US', exchange: '나스닥', currency: 'USD', color: '#2E3FC8', logo: '소' },
  { symbol: 'RIVN', code: 'RIVN', name: '리비안', market: 'US', exchange: '나스닥', currency: 'USD', color: '#7A5C00', logo: '리' },
  { symbol: 'F', code: 'F', name: '포드', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#C2185B', logo: '포' },
  { symbol: 'GM', code: 'GM', name: 'GM', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#00695C', logo: 'G' },
  { symbol: 'DAL', code: 'DAL', name: '델타항공', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#4527A0', logo: '델' },
  { symbol: 'BKNG', code: 'BKNG', name: '부킹홀딩스', market: 'US', exchange: '나스닥', currency: 'USD', color: '#AD1457', logo: '부' },
  { symbol: 'SPGI', code: 'SPGI', name: 'S&P글로벌', market: 'US', exchange: '뉴욕', currency: 'USD', color: '#283593', logo: 'S' },
  { symbol: '207940.KS', code: '207940', name: '삼성바이오로직스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00838F', logo: '삼' },
  { symbol: '051910.KS', code: '051910', name: 'LG화학', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#EF6C00', logo: 'L' },
  { symbol: '006400.KS', code: '006400', name: '삼성SDI', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#5D4037', logo: '삼' },
  { symbol: '105560.KS', code: '105560', name: 'KB금융', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#455A64', logo: 'K' },
  { symbol: '055550.KS', code: '055550', name: '신한지주', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#827717', logo: '신' },
  { symbol: '086790.KS', code: '086790', name: '하나금융지주', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#1F5FDB', logo: '하' },
  { symbol: '316140.KS', code: '316140', name: '우리금융지주', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#D92B3C', logo: '우' },
  { symbol: '032830.KS', code: '032830', name: '삼성생명', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#12A03C', logo: '삼' },
  { symbol: '000810.KS', code: '000810', name: '삼성화재', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#E06E0A', logo: '삼' },
  { symbol: '138040.KS', code: '138040', name: '메리츠금융지주', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#6132CE', logo: '메' },
  { symbol: '015760.KS', code: '015760', name: '한국전력', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#0B72B8', logo: '한' },
  { symbol: '017670.KS', code: '017670', name: 'SK텔레콤', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00867C', logo: 'S' },
  { symbol: '030200.KS', code: '030200', name: 'KT', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#B0323F', logo: 'K' },
  { symbol: '032640.KS', code: '032640', name: 'LG유플러스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#2E3FC8', logo: 'L' },
  { symbol: '034730.KS', code: '034730', name: 'SK', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#7A5C00', logo: 'S' },
  { symbol: '003550.KS', code: '003550', name: 'LG', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#C2185B', logo: 'L' },
  { symbol: '012330.KS', code: '012330', name: '현대모비스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00695C', logo: '현' },
  { symbol: '009540.KS', code: '009540', name: 'HD한국조선해양', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#4527A0', logo: 'H' },
  { symbol: '042660.KS', code: '042660', name: '한화오션', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#AD1457', logo: '한' },
  { symbol: '012450.KS', code: '012450', name: '한화에어로스페이스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#283593', logo: '한' },
  { symbol: '064350.KS', code: '064350', name: '현대로템', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00838F', logo: '현' },
  { symbol: '011200.KS', code: '011200', name: 'HMM', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#EF6C00', logo: 'H' },
  { symbol: '003490.KS', code: '003490', name: '대한항공', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#5D4037', logo: '대' },
  { symbol: '090430.KS', code: '090430', name: '아모레퍼시픽', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#455A64', logo: '아' },
  { symbol: '097950.KS', code: '097950', name: 'CJ제일제당', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#827717', logo: 'C' },
  { symbol: '271560.KS', code: '271560', name: '오리온', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#1F5FDB', logo: '오' },
  { symbol: '033780.KS', code: '033780', name: 'KT&G', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#D92B3C', logo: 'K' },
  { symbol: '036570.KS', code: '036570', name: '엔씨소프트', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#12A03C', logo: '엔' },
  { symbol: '251270.KS', code: '251270', name: '넷마블', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#E06E0A', logo: '넷' },
  { symbol: '259960.KS', code: '259960', name: '크래프톤', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#6132CE', logo: '크' },
  { symbol: '352820.KS', code: '352820', name: '하이브', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#0B72B8', logo: '하' },
  { symbol: '377300.KS', code: '377300', name: '카카오페이', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00867C', logo: '카' },
  { symbol: '323410.KS', code: '323410', name: '카카오뱅크', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#B0323F', logo: '카' },
  { symbol: '018260.KS', code: '018260', name: '삼성에스디에스', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#2E3FC8', logo: '삼' },
  { symbol: '010130.KS', code: '010130', name: '고려아연', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#7A5C00', logo: '고' },
  { symbol: '009150.KS', code: '009150', name: '삼성전기', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#C2185B', logo: '삼' },
  { symbol: '066570.KS', code: '066570', name: 'LG전자', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#00695C', logo: 'L' },
  { symbol: '034020.KS', code: '034020', name: '두산에너빌리티', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#4527A0', logo: '두' },
  { symbol: '042700.KS', code: '042700', name: '한미반도체', market: 'KR', exchange: '코스피', currency: 'KRW', color: '#AD1457', logo: '한' },
  { symbol: '247540.KQ', code: '247540', name: '에코프로비엠', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#283593', logo: '에' },
  { symbol: '086520.KQ', code: '086520', name: '에코프로', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#00838F', logo: '에' },
  { symbol: '196170.KQ', code: '196170', name: '알테오젠', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#EF6C00', logo: '알' },
  { symbol: '263750.KQ', code: '263750', name: '펄어비스', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#5D4037', logo: '펄' },
  { symbol: '293490.KQ', code: '293490', name: '카카오게임즈', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#455A64', logo: '카' },
  { symbol: '041510.KQ', code: '041510', name: '에스엠', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#827717', logo: '에' },
  { symbol: '035900.KQ', code: '035900', name: 'JYP Ent', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#1F5FDB', logo: 'J' },
  { symbol: '122870.KQ', code: '122870', name: '와이지엔터테인먼트', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#D92B3C', logo: '와' },
  { symbol: '403870.KQ', code: '403870', name: 'HPSP', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#12A03C', logo: 'H' },
  { symbol: '058470.KQ', code: '058470', name: '리노공업', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#E06E0A', logo: '리' },
  { symbol: '240810.KQ', code: '240810', name: '원익IPS', market: 'KR', exchange: '코스닥', currency: 'KRW', color: '#6132CE', logo: '원' },
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
  console.log(`\nearnings.json 갱신 완료 — ${updated}/${UNIVERSE.length}종목, asOf=${out.asOf}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
