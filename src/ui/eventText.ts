// 引擎事件 → 戰鬥紀錄文字。純函式，可以在 Node 測試。

import { CARDS } from '../data/cards.ts';
import { CHARACTERS } from '../data/characters.ts';
import type { CharacterId, GameEvent, GameState, Powers } from '../engine/types.ts';
import { unitName } from './view.ts';

export type LogKind = 'heading' | 'turn' | 'normal' | 'good' | 'bad';

export interface LogText {
  text: string;
  kind: LogKind;
}

const POWER_NAME: Readonly<Record<keyof Powers, string>> = {
  noRetreat: '不退',
  lingeringPoison: '餘毒',
  loadedDice: '灌鉛骰子',
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const blockedText = (b: number) => (b > 0 ? `（格擋擋下 ${b}）` : '');

/**
 * 把一個事件轉成紀錄文字；不需要顯示的事件回傳 null。
 * state 用來查名字，請傳入該事件所屬的 reduce 結果狀態。
 */
export function eventToText(e: GameEvent, state: GameState): LogText | null {
  const name = (id: string) => unitName(state, id);
  const quoted = (id: string) => (id in CHARACTERS ? name(id) : `「${name(id)}」`);

  switch (e.type) {
    case 'runStarted':
      return { text: `新的一輪開始（種子 ${e.seed}）`, kind: 'heading' };
    case 'battleStarted':
      return { text: `第 ${e.battleIndex + 1} 戰：${e.title}`, kind: 'heading' };
    case 'turnStarted':
      return { text: `第 ${e.turn} 回合`, kind: 'turn' };
    case 'shuffle':
      return { text: `棄牌堆洗回抽牌堆（${e.count} 張）`, kind: 'normal' };
    case 'cardPlayed': {
      const def = CARDS[e.cardId];
      const target = e.targetId ? ` → ${quoted(e.targetId)}` : '';
      return { text: `${CHARACTERS[def.owner].name}打出「${def.name}」${e.multiplier === 2 ? '（增幅）' : ''}${target}`, kind: 'normal' };
    }
    case 'ampSet':
      return { text: `增幅待命 ${e.charges} 次`, kind: 'good' };
    case 'energy':
      return { text: `獲得 ${e.amount} 點能量`, kind: 'good' };
    case 'hpLoss':
      return { text: `${name(e.targetId)}失去 ${e.amount} 點生命`, kind: 'bad' };
    case 'damage': {
      if (e.source === 'poison') return { text: `${quoted(e.targetId)}受到 ${e.amount} 點中毒傷害`, kind: 'good' };
      if (e.source === 'thorns') return { text: `雷翁反擊，對${quoted(e.targetId)}造成 ${e.amount} 點傷害`, kind: 'good' };
      if (e.source === 'enemy') {
        const attacker = e.sourceId ? quoted(e.sourceId) : '敵人';
        return { text: `${attacker}攻擊${name(e.targetId)}，造成 ${e.amount} 點傷害${blockedText(e.blocked)}`, kind: 'bad' };
      }
      const src = CHARACTERS[e.source as CharacterId].name;
      return { text: `${src}對${quoted(e.targetId)}造成 ${e.amount} 點傷害${blockedText(e.blocked)}`, kind: 'good' };
    }
    case 'block':
      return { text: `${quoted(e.targetId)}獲得 ${e.amount} 點格擋`, kind: e.targetId in CHARACTERS ? 'good' : 'normal' };
    case 'heal':
      return e.amount > 0 ? { text: `${name(e.targetId)}回復 ${e.amount} 點生命`, kind: 'good' } : null;
    case 'poison':
      return { text: `${quoted(e.targetId)}中毒 +${e.amount}（共 ${e.total} 層）`, kind: 'good' };
    case 'analyzed':
      return { text: `盧西安解析了${quoted(e.targetId)}：本回合受到的傷害 +50%`, kind: 'good' };
    case 'thorns':
      return { text: `雷翁擺出反擊架勢（反擊 ${e.total}）`, kind: 'good' };
    case 'powerGained':
      return { text: `能力「${POWER_NAME[e.power]}」生效，本場戰鬥有效`, kind: 'good' };
    case 'rigged':
      return { text: '艾斯把一張牌藏進袖子裡：下一次下注必定成功', kind: 'good' };
    case 'bet': {
      if (e.success) {
        const why = e.reason === 'rigged' ? '出千' : e.reason === 'loadedDice' ? '灌鉛骰子' : `成功率 ${pct(e.chance)}`;
        return { text: `下注成功（${why}）`, kind: 'good' };
      }
      return { text: `下注失敗（成功率 ${pct(e.chance)}），手氣 +1（目前 ${e.luck}）`, kind: 'bad' };
    }
    case 'luckSpent':
      return { text: `艾斯用掉 ${e.amount} 層手氣`, kind: 'normal' };
    case 'intentReduced':
      return { text: `${quoted(e.enemyId)}的攻擊被壓制，傷害 −${e.amount}`, kind: 'good' };
    case 'strength':
      return { text: `${quoted(e.enemyId)}攻擊力 +${e.amount}`, kind: 'bad' };
    case 'allyDown':
      return { text: `${name(e.allyId)}倒下了，本場無法再使用其卡牌`, kind: 'bad' };
    case 'enemyDefeated':
      return { text: `${quoted(e.enemyId)}消散了`, kind: 'good' };
    case 'battleWon':
      return { text: '戰鬥勝利！', kind: 'heading' };
    case 'cardAdded':
      return { text: `「${CARDS[e.cardId].name}」加入牌組`, kind: 'normal' };
    case 'cardRemoved':
      return { text: `「${CARDS[e.cardId].name}」從牌組移除`, kind: 'normal' };
    case 'revived':
      return { text: `${name(e.allyId)}經由錨點重新凝聚（${e.hp} 生命）`, kind: 'good' };
    case 'runWon':
      return { text: '十場戰鬥全部勝利！', kind: 'heading' };
    case 'runLost':
      return { text: `隊伍全滅，止步於第 ${e.battleIndex + 1} 戰`, kind: 'heading' };
    case 'routeBuilt':
    case 'enemyTurn':
    case 'draw':
    case 'discardHand':
    case 'intentChosen':
    case 'rewardOffered':
    case 'actionRejected':
      return null;
  }
}
