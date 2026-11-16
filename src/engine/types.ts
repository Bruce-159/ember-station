// 引擎所有型別。純 TypeScript，不可 import React。

// ───────────── 角色與卡牌 id ─────────────

export type CharacterId = 'lucian' | 'leon' | 'agnes' | 'ace';
/** 有血條、會被攻擊的同伴（盧西安不在其中） */
export type AllyId = Exclude<CharacterId, 'lucian'>;

export type CardId =
  // 盧西安
  | 'pulse'
  | 'field'
  | 'amp'
  | 'analyze'
  | 'chainAmp'
  | 'overload'
  | 'calibrate'
  // 雷翁
  | 'phalanx'
  | 'thrust'
  | 'bloodOath'
  | 'shieldBash'
  | 'holdFirm'
  | 'noRetreat'
  | 'lastCharge'
  // 阿格妮絲
  | 'herb'
  | 'poultice'
  | 'spark'
  | 'miasma'
  | 'corrode'
  | 'consume'
  | 'soothe'
  | 'wildfire'
  | 'lingeringPoison'
  // 艾斯
  | 'allIn'
  | 'sleeve'
  | 'bulletRain'
  | 'goAllIn'
  | 'loadedDice'
  | 'losersRevenge'
  | 'notForYou'
  | 'coverFire';

export type EncounterId =
  // 前段
  | 'platform'
  | 'ticketOffice'
  | 'benches'
  | 'ticketGate'
  | 'lostAndFound'
  // 精英一
  | 'waitingRoom'
  | 'lostStorage'
  // 中段
  | 'baggageRoom'
  | 'timetable'
  | 'platformTwo'
  | 'queue'
  // 精英二
  | 'clockTower'
  | 'signalRoom'
  // 後段
  | 'overpass'
  | 'endlessTrack'
  | 'platformEnd'
  | 'lastCarriage'
  // Boss
  | 'train'
  | 'stationOffice';

export type RelicId =
  // 增幅
  | 'resonanceCrystal'
  | 'overloadCoil'
  | 'warmAmp'
  // 雷翁
  | 'sacredOath'
  | 'brokenCrest'
  // 阿格妮絲
  | 'charredPouch'
  | 'pyreEmber'
  // 艾斯
  | 'cheatersWatch'
  | 'chippedCard'
  // 通用
  | 'fadedTimetable'
  | 'travelersFlask'
  | 'meteorShard';

/** 遺物的「每場／每回合第一次」紀錄 */
export interface RelicFlags {
  /** 共鳴水晶：本場已用掉 ×3（戰鬥開始重置） */
  resonanceUsed: boolean;
  /** 過載線圈：本回合已抽過（回合開始重置） */
  coilUsed: boolean;
  /** 斷裂的盾徽：本場已給過格擋（戰鬥開始重置） */
  crestUsed: boolean;
  /** 聖隊的誓約：本場已提示過（戰鬥開始重置） */
  oathShown: boolean;
}

export type CardType = 'attack' | 'skill' | 'power';
export type TargetKind = 'enemy' | 'ally' | 'none';
/** 增幅倍率（共鳴水晶讓每場第一次增幅為 3） */
export type Multiplier = 1 | 2 | 3;

/** 牌組／牌堆中的一張實體牌 */
export interface CardInstance {
  readonly uid: number;
  readonly cardId: CardId;
}

/** 卡牌數值：所有會被增幅或調整的數字都放這裡 */
export type CardValues = Readonly<Record<string, number>>;

/** 打出卡牌時，卡牌效果可以讀寫的上下文 */
export interface PlayContext {
  readonly state: GameState;
  readonly events: GameEvent[];
  readonly m: Multiplier;
  /** target 為 enemy 的牌才有 */
  readonly enemy: Enemy | null;
  /** target 為 ally 的牌才有 */
  readonly ally: Ally | null;
}

/** 產生卡牌說明文字時的上下文（唯讀） */
export interface DescribeContext {
  readonly state: GameState | null;
  readonly m: Multiplier;
  readonly enemy: Enemy | null;
}

export interface CardDef<V extends CardValues = CardValues> {
  readonly id: CardId;
  readonly name: string;
  readonly owner: CharacterId;
  readonly cost: number;
  readonly type: CardType;
  readonly target: TargetKind;
  /** 增幅類（增幅、連鎖增幅）：不吃增幅、不消耗增幅 */
  readonly isAmp?: boolean;
  /** 打出後移除 */
  readonly exhaust?: boolean;
  /** 每回合限用一次 */
  readonly oncePerTurn?: boolean;
  /** 是否在獎勵卡池中 */
  readonly reward: boolean;
  readonly values: V;
  play(ctx: PlayContext, values: V): void;
  describe(ctx: DescribeContext, values: V): string;
}

// ───────────── 場上單位 ─────────────

export interface Ally {
  readonly id: AllyId;
  hp: number;
  maxHp: number;
  block: number;
  /** 反擊值（雷翁的堅守反擊） */
  thorns: number;
}

export type IntentPattern =
  | { readonly kind: 'attack'; readonly damage: number; readonly hits: number }
  | { readonly kind: 'aoe'; readonly damage: number }
  | { readonly kind: 'defend'; readonly block: number; readonly strength: number };

export type Intent =
  | { kind: 'attack'; damage: number; hits: number; targetId: AllyId }
  | { kind: 'aoe'; damage: number }
  | { kind: 'defend'; block: number; strength: number };

export interface Enemy {
  readonly id: string;
  readonly name: string;
  hp: number;
  maxHp: number;
  block: number;
  poison: number;
  /** 攻擊力（DEF 意圖會永久提高） */
  strength: number;
  analyzed: boolean;
  readonly pattern: readonly IntentPattern[];
  /** 下一次要取用的行動模式索引 */
  patternIndex: number;
  intent: Intent | null;
}

// ───────────── 遊戲狀態 ─────────────

export type Phase = 'title' | 'battle' | 'reward' | 'remove' | 'victory' | 'defeat';

export interface Powers {
  noRetreat: boolean;
  lingeringPoison: boolean;
  loadedDice: boolean;
}

export interface GameState {
  phase: Phase;
  seed: number;
  /** 亂數產生器的內部狀態；所有隨機都經由它 */
  rngState: number;
  nextUid: number;

  /** 目前第幾場戰鬥（0 起算） */
  battleIndex: number;
  /** 這一輪的 10 場遭遇（開局時產生，battleIndex 是它的索引） */
  route: EncounterId[];
  turn: number;
  energy: number;

  allies: Ally[];
  enemies: Enemy[];

  deck: CardInstance[];
  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exhausted: CardInstance[];

  ampCharges: number;
  luck: number;
  rigged: boolean;
  sleeveUsed: boolean;
  firstBetDone: boolean;
  powers: Powers;
  /** 持有的媒介物品（取得順序） */
  relics: RelicId[];
  relicFlags: RelicFlags;

  rewardOptions: CardId[];
}

// ───────────── 動作 ─────────────

export type Action =
  | { type: 'NEW_RUN'; seed: number }
  | { type: 'PLAY_CARD'; uid: number; targetId?: string }
  | { type: 'END_TURN' }
  | { type: 'PICK_REWARD'; cardId: CardId | null }
  | { type: 'REMOVE_CARD'; uid: number | null };

// ───────────── 事件 ─────────────

export type DamageSource = CharacterId | 'enemy' | 'poison' | 'thorns';

export type BetReason = 'rigged' | 'loadedDice' | 'roll';

export type UnplayableReason = 'phase' | 'notInHand' | 'energy' | 'ownerDown' | 'oncePerTurn';

export type RejectReason = UnplayableReason | 'invalidTarget' | 'invalidChoice';

export type GameEvent =
  | { type: 'runStarted'; seed: number }
  | { type: 'routeBuilt'; route: EncounterId[] }
  | { type: 'battleStarted'; battleIndex: number; encounterId: EncounterId; title: string }
  | { type: 'turnStarted'; turn: number }
  | { type: 'shuffle'; count: number }
  | { type: 'draw'; uids: number[] }
  | { type: 'discardHand'; uids: number[] }
  | { type: 'cardPlayed'; uid: number; cardId: CardId; multiplier: Multiplier; targetId: string | null }
  | { type: 'ampSet'; charges: number }
  | { type: 'energy'; amount: number; total: number }
  | { type: 'hpLoss'; targetId: AllyId; amount: number }
  | {
      type: 'damage';
      targetId: string;
      /** 實際扣除的生命 */
      amount: number;
      /** 被格擋吸收的量 */
      blocked: number;
      source: DamageSource;
      sourceId: string | null;
    }
  | { type: 'block'; targetId: string; amount: number }
  | { type: 'heal'; targetId: AllyId; amount: number }
  | { type: 'poison'; targetId: string; amount: number; total: number }
  | { type: 'analyzed'; targetId: string }
  | { type: 'thorns'; amount: number; total: number }
  | { type: 'powerGained'; power: keyof Powers }
  | { type: 'rigged' }
  | { type: 'bet'; success: boolean; reason: BetReason; chance: number; luck: number }
  | { type: 'luckSpent'; amount: number }
  | { type: 'intentReduced'; enemyId: string; amount: number; damage: number }
  | { type: 'strength'; enemyId: string; amount: number; total: number }
  | { type: 'enemyTurn'; enemyId: string }
  | { type: 'intentChosen'; enemyId: string; intent: Intent }
  | { type: 'allyDown'; allyId: AllyId }
  | { type: 'enemyDefeated'; enemyId: string }
  | { type: 'battleWon'; battleIndex: number }
  | { type: 'rewardOffered'; cardIds: CardId[] }
  | { type: 'cardAdded'; uid: number; cardId: CardId }
  | { type: 'cardRemoved'; uid: number; cardId: CardId }
  | { type: 'revived'; allyId: AllyId; hp: number }
  | { type: 'relicTriggered'; relicId: RelicId }
  | { type: 'runWon' }
  | { type: 'runLost'; battleIndex: number }
  | { type: 'actionRejected'; action: Action['type']; reason: RejectReason };

/**
 * 影格：一段事件與這段事件結算後的狀態快照。
 * UI 依序播放影格，就能讓敵人一個一個行動（第 4 節的 400 毫秒間隔）。
 */
export interface Frame {
  state: GameState;
  events: GameEvent[];
}

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
  /**
   * 只在 reduce(state, action, { frames: true }) 時提供。
   * 所有影格的事件依序串起來等於 events，最後一個影格的狀態等於 state。
   */
  frames?: Frame[];
}

export interface ReduceOptions {
  frames?: boolean;
}

/** 影格記錄器：記下目前已經切到第幾個事件 */
export interface FrameRecorder {
  readonly frames: Frame[];
  mark: number;
}

/** 引擎內部可變的工作區：在 reducer 複製出的草稿上運算，並收集事件 */
export interface Ctx {
  readonly state: GameState;
  readonly events: GameEvent[];
  readonly recorder?: FrameRecorder;
}
