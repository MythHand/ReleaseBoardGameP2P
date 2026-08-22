import {
  CARD_RATIO,
  CENTRE_SETS,
  CENTRE_SLOTS,
  CENTRE_TOP,
  type CentreSet,
  type CentreSlot,
  type CentreTilt,
  centreTransform,
  Typography,
} from '@release/ui'
import { useState } from 'react'
import { pick, useLang } from '../../Playground/lang'
import { TechSwitch } from '../controls/TechControls'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './TableCentreBlock.module.css'

// The centre of the table, drawn as what it is: named places, not a component
// with content. One stage, and a switch between the game situations — the sets
// are alternatives, never a list to scroll: the table is in exactly one of them
// at a time, and comparing them is done by flipping, not by stacking.
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
  ai: 'effect',
  aiPick: 'effect',
}

export default function TableCentreBlock() {
  const { lang } = useLang()
  const [set, setSet] = useState<CentreSet>('defence')
  const w = pick(lang, {
    ru: {
      places: 'Места центра',
      intro:
        'Центр стола — это не блок с содержимым, а набор именованных мест: куда встаёт разыгранный релиз, где открыто лежит его цена, куда прилетает атака, что накрывает её сверху, где стоит вскрытый триггер и его эффект. Пустое место выглядит как ничто, поэтому его так легко описать дважды — сцена рисует свои координаты в CSS, борд рисует такие же рядом, и совпадают они только вручную. Здесь показаны сами места: рамки пунктиром, потому что карта тут не стоит, а размер рамки — настоящий размер карты, которая на неё встанет.',
      switchLabel: 'ситуация',
      note: {
        reveal:
          'Добор, вскрытый триггер, Error 503. Одно место, ровно по центру — и карта на нём лежит без наклона (инвариант I11: наклон значит, что карту положила рука игрока).',
        release:
          'Релиз стоит слева, его цена — открыто справа, симметрично центру. Пара, которую глаз читает разом: видно и что разыграно, и чем за это заплачено. Обе карты ровные, хотя обе из руки: наклон отмечает сыгранную карту, а релиз в ожидании оплаты ещё не сыгран — и ровным он останется в своей зоне, где под углом лежит только подоткнутый Code Review.',
        defence:
          'Атака в центре, защита ровно поверх неё — то же место, слой выше. Судо ждёт слева и НИЖЕ атаки: оно ещё не часть пары. Накрывающая карта ложится со своим смещением и наклоном, чтобы читались две игры, а не одна аккуратная стопка.',
        ai: 'Слева триггер, из-за которого карта пришла, справа сам эффект — и он ШИРЕ остальных мест: это главная карта момента, её читают.',
        aiPick:
          'Тот же разбор, плюс отданная карта: она встаёт открыто справа от эффекта, чтобы стол видел не только требование, но и чем его закрыли.',
      },
      values: 'Значения',
      source:
        'Значения приходят из `CENTRE_SLOTS` и `CENTRE_SETS` (`apps/ui/src/table/TableCentre/centre.ts`) — страница держит не копию, а тот же источник, из которого их берёт стол. Поменяется число там — поедет и эта страница.',
      colSlot: 'место',
      colDx: 'сдвиг',
      colW: 'ширина',
      colZ: 'слой',
      colFrom: 'откуда перенесено',
      square: 'ложится ровно',
      own: 'под своим углом',
      tilts:
        'Наклона у места нет и не будет — место говорит только КУДА карта прилетает. Под каким углом она там ляжет, решает тот, кто её привёз, и одинаковым этот угол быть не должен: в куче сброса он у каждой карты свой, посчитанный от ключа, поэтому у всех игроков куча выглядит одинаково, а полёт и покой читают один и тот же разброс. Здесь записан только характер — ровно или под своим углом, — и он отвечает на вопрос «кто положил карту», а не «на сколько градусов».',
      layers:
        'Слой значим только внутри своего набора: в защите места лежат друг на друге и разложены по 9/10/11, в разборе AI ничего не перекрывается, поэтому там свои значения, а 0 означает, что слоя в сцене не задано.',
      open: 'Чего здесь пока нет',
      openNote:
        'Наборов выбывания и передачи карт между игроками нет: набор появляется тогда, когда его показала сцена, а не «наверное такой же». До тех пор их мест нет — и это видно.',
    },
    en: {
      places: 'The places of the centre',
      intro:
        'The centre of the table is not a block with content but a set of named places: where a played release stands, where its price lies in the open, where an attack lands, what covers it, where a revealed trigger and its effect stand. An empty place looks like nothing, which is why it was so easy to describe twice — the scene draws its coordinates in CSS, the board draws the same ones beside it, and they match by hand alone. What is shown here are the places themselves: framed with dashes because no card is standing in them, and framed at the real size of the card that will.',
      switchLabel: 'situation',
      note: {
        reveal:
          'A draw, a revealed trigger, an Error 503. One place, dead centre — and the card lies square on it (invariant I11: a tilt means a player’s hand put it there).',
        release:
          'The release stands to the left, its price in the open to the right, symmetric about the centre. A pair the eye reads at once: what was played, and what was paid for it. Both lie square though both came from a hand: the tilt marks a card that has been PLAYED, and a release waiting for its price has not been — and it stays square in its zone, where only the Code Review tucked under it sits at an angle.',
        defence:
          'The attack at the centre, the defence exactly over it — same place, higher layer. The sudo waits to the left and BELOW the attack: it is not part of the pair yet. The covering card lands at its own offset and tilt, so the two read as two plays rather than one neat stack.',
        ai: 'The trigger that brought the card on the left, the effect itself on the right — and it is WIDER than the other places: it is the card the table is reading at that moment.',
        aiPick:
          'The same reading, plus the card given up: it stands in the open to the right of the effect, so the table sees not only the demand but what answered it.',
      },
      values: 'Values',
      source:
        'The values come from `CENTRE_SLOTS` and `CENTRE_SETS` (`apps/ui/src/table/TableCentre/centre.ts`) — this page holds no copy, but the very source the table reads. Change a number there and this page moves with it.',
      colSlot: 'place',
      colDx: 'offset',
      colW: 'width',
      colZ: 'layer',
      colFrom: 'taken from',
      square: 'lies square',
      own: 'at its own angle',
      tilts:
        'A place carries no angle and never will — it says only WHERE a card lands. What angle it lies at is decided by whoever brought it, and it is deliberately not uniform: in the discard heap every card has its own, computed from a key, so the heap looks the same to every player and the flight and the rest read one and the same scatter. What is recorded here is the character alone — square or at its own angle — and it answers “who put the card there”, not “how many degrees”.',
      layers:
        'A layer only means anything inside its own set: in the defence the places lie on top of each other and run 9/10/11, in the AI reading nothing overlaps so its values are its own, and 0 means the scene set no layer at all.',
      open: 'What is deliberately missing',
      openNote:
        'There are no sets for elimination or for cards passing between players: a set exists once a scene has shown it, never as “probably the same”. Until then those places do not exist — and that is visible here.',
    },
  })

  const options: { value: CentreSet; label: string }[] = (
    Object.keys(CENTRE_SETS) as CentreSet[]
  ).map((id) => ({ value: id, label: id }))

  return (
    <KitPage title="Table centre" tag="block">
      <KitSection title={w.places}>
        <Typography variant="body">{w.intro}</Typography>
        <div className={styles.bar}>
          <TechSwitch label={w.switchLabel} options={options} value={set} onChange={setSet} />
        </div>
        <Typography variant="body">{w.note[set]}</Typography>
        <div className={styles.stage}>
          <div className={styles.axis} />
          {(Object.entries(CENTRE_SETS[set]) as [CentreSlot, CentreTilt][]).map(([slot, tilt]) => {
            const { dx, z, w: width } = CENTRE_SLOTS[slot]
            return (
              <div
                key={slot}
                className={`${styles.slot} ${slot === LEAD[set] ? styles.slotLead : ''}`}
                style={{
                  insetBlockStart: `${CENTRE_TOP}%`,
                  insetInlineStart: '50%',
                  inlineSize: `${width}px`,
                  // the real card box: a card is TALLER than it is wide by
                  // CARD_RATIO, and a frame that ignored it would show places
                  // at a size no card in the game ever has
                  blockSize: `${Math.round(width * CARD_RATIO)}px`,
                  // The frame is NEVER tilted, whatever the card on it will
                  // do. A place marks where a card lands; its angle belongs to
                  // whoever brought it and is deliberately not uniform. And a
                  // rotated place would stop being the card's true box, which
                  // is what every flight aims at (I6).
                  transform: centreTransform(slot),
                  zIndex: z,
                }}
              >
                <div>
                  <Typography as="div" base="mono-strong" tk="tk-10" className={styles.name}>
                    {slot}
                  </Typography>
                  <Typography as="div" base="mono-xs" className={styles.geom}>
                    {dx === 0 ? 'dx 0' : `dx ${dx > 0 ? '+' : ''}${dx}`} · {width}px · z {z}
                  </Typography>
                  <Typography as="div" base="mono-xs" className={styles.pose}>
                    {tilt === 'own' ? w.own : w.square}
                  </Typography>
                </div>
              </div>
            )
          })}
        </div>
      </KitSection>

      <KitSection title={w.values}>
        <Typography variant="body">{w.source}</Typography>
        <Typography variant="body">{w.tilts}</Typography>
        <Typography variant="body">{w.layers}</Typography>
        <table className={styles.values}>
          <thead>
            <tr>
              <th>{w.colSlot}</th>
              <th>{w.colDx}</th>
              <th>{w.colW}</th>
              <th>{w.colZ}</th>
              <th>{w.colFrom}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(CENTRE_SLOTS) as CentreSlot[]).map((slot) => (
              <tr key={slot}>
                <td className={styles.mono}>{slot}</td>
                <td className={styles.mono}>{CENTRE_SLOTS[slot].dx}</td>
                <td className={styles.mono}>{CENTRE_SLOTS[slot].w}</td>
                <td className={styles.mono}>{CENTRE_SLOTS[slot].z}</td>
                <td className={styles.mono}>{CENTRE_SLOTS[slot].from}</td>
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
