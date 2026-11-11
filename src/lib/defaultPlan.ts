import type { Plan } from './types';

export function defaultPlan(startDate: string): Plan {
  return {
    startDate,
    rotation: ['LA', 'UA', 'LB', 'UB'],
    warmup: [
      'אופניים או ריצה קלה – 3 דקות',
      'נדנודי רגל קדימה ולצד – 10 לכל רגל',
      'פתיחת ירכיים 90/90 ומתיחת קרסול נגד קיר – דקה',
      'סקוואט משקל גוף + לאנג׳ הליכה – 10 + 10',
      'סקיפים וקפיצות פוגו קלות – 2 סבבים קצרים',
      'באימוני עליון: סיבובי כתפיים עם גומייה + 2 סטים קלים של התרגיל הראשון',
    ],
    rules: [
      'רוב הסטים נגמרים עם 1–3 חזרות ברזרבה (RIR). כשל רק בסט האחרון של תרגילי בידוד.',
      'קפיצות וזריקות תמיד בהתחלה, במאמץ מקסימלי ועם מנוחה מלאה.',
      'לא רגליים כבדות ביום שלפני משחק.',
      'שיחקת אתמול? חצי מכמות הקפיצות היום.',
      'כשכל הסטים הגיעו לראש טווח החזרות – מוסיפים 2.5 ק״ג בעליון, 5 ק״ג ברגליים.',
      'כאב חד בברך או בקרסול בקפיצות – מורידים נפח בחצי. לא עובר תוך שבועיים – לבדיקה.',
    ],
    phases: [
      { fromWeek: 1, toWeek: 4, name: 'בסיס', notes: 'RIR 2–3, לומדים טכניקה, קפיצות כמו בתוכנית.' },
      { fromWeek: 5, toWeek: 8, name: 'כוח מתפרץ', notes: 'RIR 1–2. קפיצה לתיבה מתחלפת בקפיצת עומק מ־30 ס״מ. מוסיפים 3×3 קפיצות עם 2–3 צעדי הרצה.' },
      { fromWeek: 9, toWeek: 9, name: 'שבוע קל', notes: 'חצי מהסטים, אותם משקלים, בלי כשל. מבחנים בסוף השבוע.' },
    ],
    workouts: [
      {
        code: 'LA', name: 'Lower A', title: 'קפיצה + סקוואט',
        goal: 'כוח מתפרץ אנכי (הטבעה) וכוח בסיסי ברגליים.',
        exercises: [
          { name: 'קפיצה לתיבה', sets: 4, reps: '3', rest: '90 שנ׳', notes: 'נחיתה רכה, יורדים בצעד', kind: 'power' },
          { name: 'קפיצה לרוחק מעמידה', sets: 3, reps: '3', rest: '90 שנ׳', notes: 'נעילת נחיתה שקטה', kind: 'power' },
          { name: 'סקוואט עם מוט', sets: 4, reps: '5', rest: '2–3 דק׳', notes: 'RIR 2. בשבועיים הראשונים אפשר Goblet squat', kind: 'main', track: true },
          { name: 'ספליט סקוואט בולגרי', sets: 3, reps: '8 לרגל', rest: '90 שנ׳', notes: 'משקולות יד', kind: 'accessory', track: true },
          { name: 'כפיפת ברכיים במכונה', sets: 3, reps: '10', rest: '60 שנ׳', notes: 'סופר־סט עם הרמת עקבים', kind: 'accessory', track: true },
          { name: 'הרמת עקבים בעמידה', sets: 3, reps: '12', rest: '60 שנ׳', notes: '2 שנ׳ ירידה, עצירה למטה', kind: 'accessory', track: true },
          { name: 'Pallof press', sets: 3, reps: '10 לצד', rest: '45 שנ׳', notes: 'יציבות גו נגד סיבוב', kind: 'accessory' },
        ],
      },
      {
        code: 'UA', name: 'Upper A', title: 'דחיפה',
        goal: 'פלג עליון חזק בפחות זמן, עם סט פוטנציה בהתחלה.',
        exercises: [
          { name: 'מסירת כדור כוח מהחזה לקיר', sets: 3, reps: '5', rest: '60 שנ׳', notes: 'מהירות מקסימלית, 3–5 ק״ג', kind: 'power' },
          { name: 'לחיצת חזה עם מוט', sets: 4, reps: '5–8', rest: '2–3 דק׳', notes: 'RIR 1–2', kind: 'main', track: true },
          { name: 'מתח עליון', sets: 3, reps: '6–10', rest: '2 דק׳', notes: 'או פולאפים. RIR 2', kind: 'main', track: true },
          { name: 'לחיצת כתפיים עם משקולות יד', sets: 3, reps: '8–10', rest: '90 שנ׳', notes: 'RIR 2', kind: 'accessory', track: true },
          { name: 'חתירה בכבל', sets: 3, reps: '10–12', rest: '90 שנ׳', notes: 'עצירה של שנייה בסוף', kind: 'accessory', track: true },
          { name: 'הרחקה לצדדים + פשיטת מרפקים בכבל', sets: 3, reps: '12–15', rest: '60 שנ׳', notes: 'סופר־סט; כשל מותר בסט האחרון', kind: 'accessory' },
        ],
      },
      {
        code: 'LB', name: 'Lower B', title: 'תגובתיות, צעד ראשון, רגל אחת',
        goal: 'יציאה מהמקום, שינוי כיוון, ושרשרת אחורית חזקה.',
        exercises: [
          { name: 'קפיצות פוגו', sets: 3, reps: '15 שנ׳', rest: '60 שנ׳', notes: 'מגע קצר בקרקע', kind: 'power' },
          { name: 'ניתור לצדדים', sets: 3, reps: '4 לצד', rest: '90 שנ׳', notes: 'נחיתה ועצירה על רגל אחת', kind: 'power' },
          { name: 'ספרינט 10 מ׳', sets: 4, reps: '1', rest: 'הליכה חזרה', notes: 'מעמידת כדורסל; אין מקום – דלג', kind: 'power' },
          { name: 'דדליפט במוט משושה', sets: 4, reps: '5', rest: '2–3 דק׳', notes: 'או RDL. RIR 2, גב ניטרלי', kind: 'main', track: true },
          { name: 'לאנג׳ לאחור', sets: 3, reps: '8 לרגל', rest: '90 שנ׳', notes: 'או עלייה לתיבה', kind: 'accessory', track: true },
          { name: 'נורדיק', sets: 3, reps: '5', rest: '90 שנ׳', notes: 'או RDL על רגל אחת. ירידה איטית', kind: 'accessory' },
          { name: 'הרמת עקב על רגל אחת', sets: 3, reps: '10 לרגל', rest: '60 שנ׳', notes: 'סופר־סט עם הרמת ברכיים', kind: 'accessory', track: true },
          { name: 'הרמת ברכיים בתלייה', sets: 3, reps: '10–12', rest: '60 שנ׳', notes: 'בלי נדנוד', kind: 'accessory' },
        ],
      },
      {
        code: 'UB', name: 'Upper B', title: 'משיכה',
        goal: 'גב וכתפיים חזקים למאבקים ולריבאונדים, וכוח סיבובי מהגו.',
        exercises: [
          { name: 'זריקת כדור כוח סיבובית לקיר', sets: 3, reps: '5 לצד', rest: '60 שנ׳', notes: 'הכוח מגיע מהאגן', kind: 'power' },
          { name: 'מתח במתח', sets: 4, reps: '5–8', rest: '2–3 דק׳', notes: 'עם משקל כשאפשר. RIR 1–2', kind: 'main', track: true },
          { name: 'לחיצת חזה בשיפוע עם משקולות יד', sets: 3, reps: '8–10', rest: '2 דק׳', notes: 'RIR 2', kind: 'main', track: true },
          { name: 'חתירה עם תמיכת חזה', sets: 3, reps: '8–12', rest: '90 שנ׳', notes: 'בלי תנופה', kind: 'accessory', track: true },
          { name: 'פייס פול', sets: 2, reps: '15', rest: '60 שנ׳', notes: 'בריאות כתף', kind: 'accessory' },
          { name: 'כפיפת מרפקים + פשיטה מעל הראש', sets: 3, reps: '10–12', rest: '60 שנ׳', notes: 'סופר־סט; כשל מותר בסט האחרון', kind: 'accessory' },
          { name: 'גלגל בטן', sets: 3, reps: '8–10', rest: '45 שנ׳', notes: 'או Dead bug. גב תחתון לא קורס', kind: 'accessory' },
        ],
      },
    ],
  };
}
