import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import Pile from '@/primitives/Pile'
import TabRail from '@/primitives/TabRail'
import Typography from '@/primitives/Typography'
import Hand from '@/table/Hand'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import TurnDock from '@/table/TurnDock/TurnDock'
import { pick, useLang } from '../../Playground/lang'
import styles from './GameDealStory.module.css'

// The opening of a match — the first thing a player ever sees at this table.
// Static for now: the table stands as it stands the moment before the deal, so
// the choreography has a base to be built on. Nothing has been dealt yet — every
// hand is empty, every zone is empty, both decks are whole.
//
// The movement this page is here for (not written yet): the deal — cards leave
// the base deck and land in every seat in turn, the player's own arriving into
// their fan face-up, the opponents' sinking into their seats face-down.

const DECK_MAIN = 78 // the base deck, whole
const DECK_EVENTS = 21 // the AI deck, whole

const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }

const OPPONENTS = [
  { id: 'p2', name: 'kernel_panic' },
  { id: 'p3', name: 'segfault' },
  { id: 'p4', name: 'null_ptr' },
]

export default function GameDealStory() {
  const { lang } = useLang()
  const copy = lang === 'en' ? enCommon : ruCommon
  // the table is static so far; restart already stands where the deal will be
  // replayed from, and remounts the table as it will have to
  const [run, setRun] = useState(0)

  return (
    <div className={styles.root} key={run}>
      {/* technical top control line — dev controls (TableStory pattern) */}
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={() => setRun((n) => n + 1)}>
          <Typography base="label-sm" tk="tk-16">
            {pick(lang, { ru: 'рестарт', en: 'restart' })}
          </Typography>
        </button>
      </div>

      {/* opponents — one row on top, as on the table; nobody holds a card yet */}
      <div className={styles.opponents}>
        {OPPONENTS.map((o) => (
          <Seat
            key={o.id}
            player={{ id: o.id, name: o.name, handCount: 0, release: EMPTY_RELEASE }}
            copy={copy.seat}
          />
        ))}
      </div>

      {/* draw decks — left edge, whole: the deal has not started */}
      <div className={styles.decks}>
        <Pile label={copy.table.deck} deck="base" count={DECK_MAIN} width={150} countPos="tl" />
        <Pile label={copy.table.events} deck="ai" count={DECK_EVENTS} width={150} countPos="tl" />
      </div>

      {/* discard — empty, so it shows the game's mark and the zone it holds */}
      <div className={styles.discard}>
        <Pile label={copy.table.discard} count={0} width={116} logoVariant={lang} />
      </div>

      <div className={styles.turnDock}>
        <TurnDock state="waiting" seconds={20} progress={1} copy={copy.turnDock} />
      </div>

      {/* your area — the empty zone above the empty fan */}
      <div className={styles.you}>
        <ReleaseZone release={EMPTY_RELEASE} size="100px" />
        <div className={styles.handWrap}>
          <Hand items={[]} />
        </div>
      </div>

      {/* the page rail, as on the table. Inert: this page is the static base of a
          choreography, not the panels — a tab that opened nothing would read as
          broken, so it stands as the furniture it is. */}
      <TabRail
        items={[
          { id: 'history', label: copy.table.tabHistory },
          { id: 'participants', label: copy.table.tabParticipants },
          { id: 'rules', label: copy.table.tabRules },
          { id: 'modes', label: copy.table.tabModes },
        ]}
        active={null}
        onSelect={() => {}}
      />
    </div>
  )
}
