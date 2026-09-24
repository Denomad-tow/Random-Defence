import type { SigilDef } from './gem';

export const ROLE_SIGILS: Record<string, SigilDef> = {
  single: {
    label: '단일 딜러',
    paths: ['M60 30V90M60 30l-8 12M60 30l8 12M50 82h20'],
  },
  aoe: {
    label: '광역',
    circles: [{ cx: 60, cy: 60, r: 10 }],
    paths: ['M60 34v8M60 78v8M34 60h8M78 60h8M42 42l6 6M72 72l6 6M42 78l6-6M72 48l6-6'],
  },
  slow: {
    label: '둔화',
    paths: ['M60 38V82M41 49l38 22M41 71l38-22'],
  },
  stun: {
    label: '기절',
    paths: ['M66 32L48 62h14L54 88l20-32H60z'],
  },
  poison: {
    label: '독',
    paths: ['M60 34c10 16 18 24 18 34a18 18 0 01-36 0c0-10 8-18 18-34z'],
    circles: [{ cx: 55, cy: 70, r: 3 }],
  },
  armorBreak: {
    label: '방어력 감소',
    paths: ['M60 34l20 8v16c0 14-9 22-20 28-11-6-20-14-20-28V42z', 'M62 40l-6 14 8 6-6 16'],
  },
  buff: {
    label: '버프',
    paths: ['M44 66l16-14 16 14M44 82l16-14 16 14M60 34v12'],
  },
  goldGen: {
    label: '골드 생성',
    paths: ['M60 32l14 22-14 34-14-34z', 'M46 54h28M82 38l4 4-4 4-4-4z'],
  },
  pierce: {
    label: '관통',
    paths: ['M60 20V96', 'M50 32l10-12 10 12', 'M42 55h36', 'M42 75h36'],
  },
  multishot: {
    label: '다중 사격',
    paths: ['M44 28V92M44 28l-7 10M44 28l7 10', 'M76 28V92M76 28l-7 10M76 28l7 10'],
  },
  chain: {
    label: '사슬 번개',
    paths: ['M38 34L58 54L46 66L82 92'],
    circles: [
      { cx: 38, cy: 34, r: 4 },
      { cx: 82, cy: 92, r: 4 },
    ],
  },
  execute: {
    label: '처형',
    paths: ['M60 22V70', 'M52 30l8-8 8 8', 'M44 70h32', 'M50 70l-6 20', 'M70 70l6 20'],
  },
  manaLeech: {
    label: '마나 흡수',
    paths: ['M60 30c11 17 19 25 19 35a19 19 0 01-38 0c0-10 8-18 19-35z', 'M60 52v18', 'M53 62l7 8 7-8'],
  },
  frostAura: {
    label: '냉기 결계',
    paths: ['M60 40V80', 'M44 50l32 20', 'M44 70l32-20'],
    circles: [{ cx: 60, cy: 60, r: 30 }],
  },
  critStrike: {
    label: '치명 강타',
    paths: ['M60 18L68 52L102 60L68 68L60 102L52 68L18 60L52 52Z'],
  },
};
