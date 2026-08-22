import {
  CARD_RATIO,
  CENTRE_CARD_W,
  CENTRE_SETS,
  CENTRE_SLOTS,
  CENTRE_TOP,
  type CentreSet,
  type CentreSlot,
  centreTransform,
  Typography,
} from '@release/ui'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './TableCentreBlock.module.css'

// The centre of the table, drawn as what it is: named places, not a component
// with content. Every situation gets its own set, framed on a stand-in table, so
// the positions can be judged without playing a match to reach them.
//
// The page reads `CENTRE_SLOTS` / `CENTRE_SETS` from the kit rather than holding
// its own copy — that is the whole reason the geometry moved into TS. Change a
// number there and this page moves with it; it cannot drift.

// which slot a situation is really about — framed in the turn accent so the eye
// starts there and reads the others as answers to it
const LEAD: Record<CentreSet, CentreSlot> = {
  reveal: 'centre',
  release: 'stage',
  defence: 'centre',
}

function Places({ set }: { set: CentreSet }) {
  const slots = CENTRE_SETS[set]
  return (
    <div className={styles.stage}>
      <div className={styles.axis} />
      {slots.map((slot) => {
        const { dx, z } = CENTRE_SLOTS[slot]
        return (
          <div
            key={slot}
            className={`${styles.slot} ${slot === LEAD[set] ? styles.slotLead : ''}`}
            style={{
              insetBlockStart: `${CENTRE_TOP}%`,
              insetInlineStart: '50%',
              inlineSize: `${CENTRE_CARD_W}px`,
              blockSize: `${Math.round(CENTRE_CARD_W / CARD_RATIO)}px`,
              transform: centreTransform(slot),
              zIndex: z,
            }}
          >
            <div>
              <Typography as="div" base="mono-strong" tk="tk-10" className={styles.name}>
                {slot}
              </Typography>
              <Typography as="div" base="mono-xs" className={styles.geom}>
                {dx === 0 ? 'dx 0' : `dx ${dx > 0 ? '+' : ''}${dx}`} · z {z}
              </Typography>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TableCentreBlock() {
  const { lang } = useLang()
  const w = pick(lang, {
    ru: {
      intro:
        'Центр стола — это не блок с содержимым, а набор именованных мест: куда встаёт разыгранный релиз, где открыто лежит его цена, куда прилетает атака и что накрывает её сверху. Пустое место выглядит как ничто, поэтому его так легко описать дважды — сцена рисует свои координаты в CSS, борд рисует такие же рядом, и совпадают они только вручную. Здесь показаны сами места: рамки пунктиром, потому что карта тут не стоит.',
      source:
        'Значения приходят из `CENTRE_SLOTS` и `CENTRE_SETS` (`apps/ui/src/table/TableCentre/centre.ts`) — страница держит не копию, а тот же источник, из которого их берёт стол. Поменяется число там — поедет и эта страница.',
      reveal: 'Вскрытие: карту в центр выложила система',
      revealNote:
        'Добор, вскрытый триггер, карта из колоды событий. Одно место, ровно по центру — и карта на нём лежит без наклона (инвариант I11: наклон значит, что карту положила рука игрока).',
      release: 'Релиз платит свою цену',
      releaseNote:
        'Релиз стоит слева, его цена — открыто справа, симметрично центру. Пара, которую глаз читает разом: видно и что разыграно, и чем за это заплачено.',
      defence: 'Атаку накрыли защитой',
      defenceNote:
        'Атака в центре, защита ровно поверх неё — то же место, слой выше. Судо ждёт слева и НИЖЕ атаки: оно ещё не часть пары. Накрывающая карта ложится со своим смещением и наклоном, чтобы читались две игры, а не одна аккуратная стопка.',
      values: 'Значения',
      colSlot: 'место',
      colDx: 'сдвиг',
      colZ: 'слой',
      colWhat: 'что это',
      what: {
        sudo: 'судо ждёт свою защиту — рядом с атакой, но ещё не в паре',
        stage: 'разыгранный релиз, пока за него не заплатили',
        centre: 'то, что происходит сейчас: атака, вскрытый триггер, карта AI',
        cover: 'защита, накрывающая атаку',
        cost: 'цена релиза, открыто рядом с ним',
      },
      open: 'Чего здесь пока нет',
      openNote:
        'Наборы 503, выбывания и карт AI не заведены: набор появляется тогда, когда его показала сцена, а не «наверное такой же». До тех пор их мест нет — и это видно.',
    },
    en: {
      intro:
        'The centre of the table is not a block with content but a set of named places: where a played release stands, where its price lies in the open, where an attack lands and what covers it. An empty place looks like nothing, which is why it is so easy to describe twice — the scene draws its coordinates in CSS, the board draws the same ones beside it, and they match by hand alone. What is shown here are the places themselves, framed with dashes because no card is standing in them.',
      source:
        'The values come from `CENTRE_SLOTS` and `CENTRE_SETS` (`apps/ui/src/table/TableCentre/centre.ts`) — this page holds no copy, but the very source the table reads. Change a number there and this page moves with it.',
      reveal: 'A reveal: the system dealt the card to the centre',
      revealNote:
        'A draw, a revealed trigger, a card off the events deck. One place, dead centre — and the card lies square on it (invariant I11: a tilt means a player’s hand put it there).',
      release: 'A release paying its price',
      releaseNote:
        'The release stands to the left, its price in the open to the right, symmetric about the centre. A pair the eye reads at once: what was played, and what was paid for it.',
      defence: 'An attack covered by a defence',
      defenceNote:
        'The attack at the centre, the defence exactly over it — same place, higher layer. The sudo waits to the left and BELOW the attack: it is not part of the pair yet. The covering card lands at its own offset and tilt, so the two read as two plays rather than one neat stack.',
      values: 'Values',
      colSlot: 'place',
      colDx: 'offset',
      colZ: 'layer',
      colWhat: 'what it is',
      what: {
        sudo: 'a sudo waiting for its defence — beside the attack, not yet paired',
        stage: 'a played release, until it has been paid for',
        centre: 'what is happening now: an attack, a revealed trigger, an AI card',
        cover: 'the defence covering an attack',
        cost: 'the release’s price, in the open beside it',
      },
      open: 'What is deliberately missing',
      openNote:
        'There are no sets for Error 503, elimination or the AI cards: a set exists once a scene has shown it, never as “probably the same”. Until then those places do not exist — and that is visible here.',
    },
  })

  return (
    <KitPage title="Table centre" tag="block">
      <KitSection title={w.reveal}>
        <Typography variant="body">{w.intro}</Typography>
        <Typography variant="body">{w.revealNote}</Typography>
        <Places set="reveal" />
      </KitSection>

      <KitSection title={w.release}>
        <Typography variant="body">{w.releaseNote}</Typography>
        <Places set="release" />
      </KitSection>

      <KitSection title={w.defence}>
        <Typography variant="body">{w.defenceNote}</Typography>
        <Places set="defence" />
      </KitSection>

      <KitSection title={w.values}>
        <Typography variant="body">{w.source}</Typography>
        <table className={styles.values}>
          <thead>
            <tr>
              <th>{w.colSlot}</th>
              <th>{w.colDx}</th>
              <th>{w.colZ}</th>
              <th>{w.colWhat}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(CENTRE_SLOTS) as CentreSlot[]).map((slot) => (
              <tr key={slot}>
                <td className={styles.mono}>{slot}</td>
                <td className={styles.mono}>{CENTRE_SLOTS[slot].dx}</td>
                <td className={styles.mono}>{CENTRE_SLOTS[slot].z}</td>
                <td>{w.what[slot]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </KitSection>

      <KitSection title={w.open}>
        <Typography variant="body">{w.openNote}</Typography>
      </KitSection>
    </KitPage>
  )
}
