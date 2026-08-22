import { AskLine, CENTRE_TOP, Typography } from '@release/ui'
import { useState } from 'react'
import { pick, useLang } from '../../Playground/lang'
import { TechToggle } from '../controls/TechControls'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './AskLineBlock.module.css'

// The line the table speaks with. Shown where it actually lives — under the
// centre — because its whole geometry is an offset from the centre's height:
// drawn on a blank page it would be a plate with a number nobody can check.

export default function AskLineBlock() {
  const { lang } = useLang()
  const [shown, setShown] = useState(true)
  const w = pick(lang, {
    ru: {
      line: 'Строка, которой стол говорит',
      intro:
        'Единственное место, где стол обращается к игроку словами: «релиз стоит одной карты — вытащи любую из руки», «выбери карту». Висит под центром, потому что просит она про то, что происходит в центре — и держится не своей высотой, а высотой центра: CENTRE_TOP плюс смещение вниз. Появляется на месте: проступает и приподнимается на 14px за 260ms. Смонтирована всегда — иначе ответ игрока заканчивался бы щелчком, а не затуханием.',
      switchLabel: 'стол чего-то ждёт',
      on: 'вкл',
      off: 'выкл',
      centre: 'центр стола',
      text: 'релиз стоит одной карты — вытащи любую из руки',
      values: 'Значения',
      source:
        'Копий у этой строки было две — своя в сцене `Defense Release` и её же цитата на борде, совпадавшие до пикселя по внимательности. Теперь одна: `AskLine` (`apps/ui/src/table/TableCentre/AskLine.tsx`), рядом с геометрией центра, за которой она следует.',
      colName: 'что',
      colValue: 'значение',
      colWhy: 'почему так',
      rows: [
        [
          'высота',
          `${CENTRE_TOP}%`,
          'та же, что у центра — строка не знает своей высоты, она знает центр',
        ],
        [
          'смещение, скрыта',
          '132px',
          'ниже центра, но чуть ближе к нему — из этого положения она и всплывает',
        ],
        ['смещение, видна', '146px', 'рабочее место строки; разница в 14px и есть всё движение'],
        ['длительность', '260ms', 'проявление и подъём идут одним временем'],
        ['указатель', 'сквозь плашку', 'плашка курсор не ловит, а вложенные в неё кнопки — ловят'],
      ] as [string, string, string][],
      reduced:
        'При выключенных анимациях строка стоит сразу на своём месте, без перехода — просьба не должна ждать эффекта.',
      where: 'Где смотреть в деле',
      whereNote:
        'Сцена `Defense Release`: вытащи релиз из веера — строка попросит цену и уйдёт, как только карта отдана.',
    },
    en: {
      line: 'The line the table speaks with',
      intro:
        'The one place the table addresses the player in words: "a release costs one card — pull any of them out of the hand", "pick a card". It hangs under the centre, because what it asks about happens at the centre — and it holds no height of its own: CENTRE_TOP plus an offset down. It appears in place, rising 14px over 260ms. Always mounted, or every answer would end with a snap instead of a fade.',
      switchLabel: 'the table is waiting',
      on: 'on',
      off: 'off',
      centre: 'the centre of the table',
      text: 'a release costs one card — pull any of them out of the hand',
      values: 'Values',
      source:
        'There were two copies of this line — the scene’s own in `Defense Release` and its quotation on the board, equal to the pixel by attention alone. Now there is one: `AskLine` (`apps/ui/src/table/TableCentre/AskLine.tsx`), beside the centre geometry it follows.',
      colName: 'what',
      colValue: 'value',
      colWhy: 'why',
      rows: [
        [
          'top',
          `${CENTRE_TOP}%`,
          'the centre’s own — the line knows the centre, not a height of its own',
        ],
        [
          'offset, hidden',
          '132px',
          'below the centre but nearer to it: the position it rises out of',
        ],
        ['offset, shown', '146px', 'where it stands; the 14px difference IS the movement'],
        ['duration', '260ms', 'the fade and the rise run on one time'],
        ['pointer', 'through the plate', 'the plate catches no cursor; controls put inside it do'],
      ] as [string, string, string][],
      reduced:
        'With motion turned down the line simply stands where it belongs, with no transition — a request should not wait on an effect.',
      where: 'Where to see it working',
      whereNote:
        'The `Defense Release` scene: pull a release out of the fan and the line asks for its price, leaving the moment the card is given.',
    },
  })

  return (
    <KitPage title="Ask line" tag="block">
      <KitSection title={w.line}>
        <Typography variant="body">{w.intro}</Typography>
        <div className={styles.bar}>
          <TechToggle on={shown} onChange={setShown}>
            {`${w.switchLabel} — ${shown ? w.on : w.off}`}
          </TechToggle>
        </div>
        <div className={styles.stage}>
          <div className={styles.centre} style={{ insetBlockStart: `${CENTRE_TOP}%` }}>
            <Typography as="div" base="mono-xs">
              {w.centre}
            </Typography>
          </div>
          <AskLine shown={shown}>{w.text}</AskLine>
        </div>
      </KitSection>

      <KitSection title={w.values}>
        <Typography variant="body">{w.source}</Typography>
        <table className={styles.values}>
          <thead>
            <tr>
              <th>{w.colName}</th>
              <th>{w.colValue}</th>
              <th>{w.colWhy}</th>
            </tr>
          </thead>
          <tbody>
            {w.rows.map(([name, value, why]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className={styles.mono}>{value}</td>
                <td>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Typography variant="body">{w.reduced}</Typography>
      </KitSection>

      <KitSection title={w.where}>
        <Typography variant="body">{w.whereNote}</Typography>
      </KitSection>
    </KitPage>
  )
}
