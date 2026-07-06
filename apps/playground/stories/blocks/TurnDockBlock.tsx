import Typography from '@/primitives/Typography'
import TurnDock, { TURN_DOCK_COPY_EN, TURN_DOCK_COPY_RU } from '@/table/TurnDock/TurnDock'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// Turn dock — technical turn-control area on the Table screen (draw, end turn,
// turn timer). Custom game-HUD block. This page shows every UI state with a
// caption, plus notes on the intended timer behaviour (research — not yet wired).
export default function TurnDockBlock() {
  const { lang } = useLang()
  const copy = lang === 'en' ? TURN_DOCK_COPY_EN : TURN_DOCK_COPY_RU
  const w = pick(lang, {
    ru: {
      states: 'Состояния',
      draw: 'Ваш ход — нужен добор',
      push: 'Ваш ход — можно PUSH',
      waiting: 'Ход оппонента',
      reaction: 'Окно реакции — атака на релиз (янтарь)',
      reactionDanger: 'Окно реакции — Error 503 (danger, красный)',
      notesTitle: 'Наработки: поведение таймера',
      note1:
        'Свой ход — таймер бездействия, а не жёсткий лимит: продлевается на каждое осмысленное действие (сыграл/потянул карту, открыл прицел, добор). Обрубает только реально зависшего игрока — по таймауту авто-разрешение минимального хода (авто-добор → авто-PUSH) с предупреждением на последних секундах.',
      note2:
        'Окно реакции — время задано механикой правил: 15 сек первое окно, 10 сек каждый следующий раунд «продолжить атаку». Не выдумываем, только отображаем.',
      note3:
        'Цвет кольца — акцент по фазе: зелёный (свой ход), нейтральный (ход оппонента), янтарный (реакция-атака), красный (danger — Error 503).',
    },
    en: {
      states: 'States',
      draw: 'Your turn — draw required',
      push: 'Your turn — PUSH available',
      waiting: 'Opponent turn',
      reaction: 'Reaction window — attack a release (amber)',
      reactionDanger: 'Reaction window — Error 503 (danger, red)',
      notesTitle: 'Research: timer behaviour',
      note1:
        'Own turn — an inactivity timer, not a hard cap: it extends on every meaningful action (play/drag a card, open targeting, draw). Only a truly idle player gets cut off — on timeout, auto-resolve a minimal turn (auto-draw → auto-PUSH) with a warning in the final seconds.',
      note2:
        'Reaction window — time is defined by the rules: 15s for the first window, 10s for each follow-up “keep attacking” round. Not invented, only displayed.',
      note3:
        'Ring colour is the per-phase accent: green (your turn), neutral (opponent turn), amber (attack reaction), red (danger — Error 503).',
    },
  })

  return (
    <KitPage title="Turn dock" tag="block">
      <KitSection title={w.states}>
        <KitCell caption={w.draw}>
          <TurnDock state="draw" copy={copy} seconds={21} progress={0.72} />
        </KitCell>
        <KitCell caption={w.push}>
          <TurnDock state="push" copy={copy} seconds={16} progress={0.55} />
        </KitCell>
        <KitCell caption={w.waiting}>
          <TurnDock state="waiting" copy={copy} seconds={25} progress={0.84} activePlayer="neo" />
        </KitCell>
        <KitCell caption={w.reaction}>
          <TurnDock state="reaction" copy={copy} seconds={8} progress={0.35} activePlayer="neo" />
        </KitCell>
        <KitCell caption={w.reactionDanger}>
          <TurnDock
            state="reaction"
            copy={copy}
            seconds={5}
            progress={0.2}
            activePlayer="neo"
            danger
          />
        </KitCell>
      </KitSection>

      <KitSection title={w.notesTitle}>
        <Typography variant="body">{w.note1}</Typography>
        <Typography variant="body">{w.note2}</Typography>
        <Typography variant="body">{w.note3}</Typography>
      </KitSection>
    </KitPage>
  )
}
