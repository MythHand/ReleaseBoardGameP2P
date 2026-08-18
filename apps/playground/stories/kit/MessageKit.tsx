import Message, { MessageNote } from '@/primitives/Message'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'
import styles from './MessageKit.module.css'

// The real Message primitive — one reply in a feed — in every parameter it has.
const COPY = {
  ru: {
    roleSec: 'Роль автора — цвет имени',
    host: 'хост',
    player: 'игрок',
    spectator: 'зритель',
    selfSec: 'Своя реплика — подложка в цвет своей роли',
    selfHost: 'своя, хост',
    selfPlayer: 'своя, игрок',
    selfSpectator: 'своя, зритель',
    groupSec: 'Склейка подряд идущих реплик одного автора',
    groupCap: 'первая с шапкой и аватаром, следующие вплотную и без них',
    goneSec: 'Автор вышел',
    goneCap: 'имя на 40% прозрачности, текст читается',
    noteSec: 'Техническая запись',
    noteCap: 'событие ленты: автора нет, во всю ширину',
    longSec: 'Длинное и многострочное',
    longCap: 'перенос автора сохраняется, интерлиньяж плотный',
  },
  en: {
    roleSec: "Author's role — the name's colour",
    host: 'host',
    player: 'player',
    spectator: 'spectator',
    selfSec: 'Own reply — backdrop in your own role colour',
    selfHost: 'own, host',
    selfPlayer: 'own, player',
    selfSpectator: 'own, spectator',
    groupSec: 'Consecutive replies from one author are glued',
    groupCap: 'the first keeps the header and avatar, the rest sit flush without',
    goneSec: 'The author has left',
    goneCap: 'name at 40% opacity, the text stays readable',
    noteSec: 'Technical record',
    noteCap: 'a feed event: no author, full width',
    longSec: 'Long and multi-line',
    longCap: "the author's own line break survives, spacing stays tight",
  },
}

const TEXT = {
  ru: {
    short: 'ну что, ещё партию?',
    second: 'база третий раз подряд уже',
    left: 'я отваливаюсь, всем удачи',
    note: 'хост сменил режим добора: стратегический',
    long: 'первая строка, поставленная руками\nвторая строка, и ещё немного текста, чтобы он честно перенёсся сам',
  },
  en: {
    short: 'one more round?',
    second: "that's base three times in a row",
    left: 'dropping out, good luck all',
    note: 'host changed the draw mode: strategic',
    long: 'a first line put in by hand\na second line, plus enough text for it to honestly wrap on its own',
  },
}

export default function MessageKit() {
  const { lang } = useLang()
  const t = pick(lang, COPY)
  const text = pick(lang, TEXT)

  return (
    <KitPage title="Message">
      <KitSection title={t.roleSec}>
        <KitCell caption={t.host}>
          <div className={styles.line}>
            <Message who="TabsOverSpaces" authorRole="host" time="20:14" text={text.short} />
          </div>
        </KitCell>
        <KitCell caption={t.player}>
          <div className={styles.line}>
            <Message who="segfault" authorRole="player" time="20:14" text={text.short} />
          </div>
        </KitCell>
        <KitCell caption={t.spectator}>
          <div className={styles.line}>
            <Message who="oracle" authorRole="spectator" time="20:14" text={text.short} />
          </div>
        </KitCell>
      </KitSection>

      <KitSection title={t.selfSec}>
        <KitCell caption={t.selfHost}>
          <div className={styles.line}>
            <Message who="deadlock" authorRole="host" time="20:15" text={text.short} self />
          </div>
        </KitCell>
        <KitCell caption={t.selfPlayer}>
          <div className={styles.line}>
            <Message who="deadlock" authorRole="player" time="20:15" text={text.short} self />
          </div>
        </KitCell>
        <KitCell caption={t.selfSpectator}>
          <div className={styles.line}>
            <Message who="deadlock" authorRole="spectator" time="20:15" text={text.short} self />
          </div>
        </KitCell>
      </KitSection>

      <KitSection title={t.groupSec}>
        <KitCell caption={t.groupCap}>
          <div className={styles.stack}>
            <Message who="segfault" authorRole="player" time="20:15" text={text.short} />
            <Message who="segfault" authorRole="player" text={text.second} grouped />
          </div>
        </KitCell>
      </KitSection>

      <KitSection title={t.goneSec}>
        <KitCell caption={t.goneCap}>
          <div className={styles.line}>
            <Message who="race_cond" authorRole="player" time="20:15" text={text.left} gone />
          </div>
        </KitCell>
      </KitSection>

      <KitSection title={t.noteSec}>
        <KitCell caption={t.noteCap}>
          <div className={styles.line}>
            <MessageNote>{text.note}</MessageNote>
          </div>
        </KitCell>
      </KitSection>

      <KitSection title={t.longSec}>
        <KitCell caption={t.longCap}>
          <div className={styles.line}>
            <Message who="null_ptr" authorRole="player" time="20:16" text={text.long} />
          </div>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
