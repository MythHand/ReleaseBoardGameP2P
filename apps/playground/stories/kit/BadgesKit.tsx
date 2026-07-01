import Badge from '@/primitives/Badge'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Badge primitive: tones, outline, sizes — statuses and roles from the screens.
const COPY = {
  ru: {
    roles: 'Роли',
    spectator: 'зритель',
    readiness: 'Статус готовности',
    ready: 'готов',
    waiting: 'ожидание',
    offline: 'не в сети',
    tableStatus: 'Статус за столом (sm)',
    eliminated: 'выбыл',
    noConnection: 'нет связи',
    plate: 'Плашка (lg) — тёмный фон + рамка, напр. «вы выбыли»',
    youAreOut: 'вы выбыли из игры',
    whereNow: '«Где сейчас» — outlined md, все тона',
    inGame: 'в игре',
    onStats: 'на статистике',
    inLobby: 'в лобби',
  },
  en: {
    roles: 'Roles',
    spectator: 'spectator',
    readiness: 'Readiness status',
    ready: 'ready',
    waiting: 'waiting',
    offline: 'offline',
    tableStatus: 'Table status (sm)',
    eliminated: 'eliminated',
    noConnection: 'no connection',
    plate: 'Plate (lg) — dark bg + border, e.g. "you are out"',
    youAreOut: 'you are out of the game',
    whereNow: '"Where now" — outlined md, all tones',
    inGame: 'in game',
    onStats: 'on stats',
    inLobby: 'in lobby',
  },
}

export default function BadgesKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Badges">
      <KitSection title={t.roles}>
        <KitCell caption="host (outlined sm)">
          <Badge tone="success" size="sm" outlined>
            host
          </Badge>
        </KitCell>
        <KitCell caption="spectator (muted)">
          <Badge tone="muted">{t.spectator}</Badge>
        </KitCell>
      </KitSection>

      <KitSection title={t.readiness}>
        <KitCell caption="ready (success)">
          <Badge tone="success">{t.ready}</Badge>
        </KitCell>
        <KitCell caption="waiting (muted)">
          <Badge tone="muted">{t.waiting}</Badge>
        </KitCell>
        <KitCell caption="offline (muted)">
          <Badge tone="muted">{t.offline}</Badge>
        </KitCell>
      </KitSection>

      <KitSection title={t.tableStatus}>
        <KitCell caption="eliminated (muted)">
          <Badge tone="muted" size="sm">
            {t.eliminated}
          </Badge>
        </KitCell>
        <KitCell caption="disconnected (danger)">
          <Badge tone="danger" size="sm">
            {t.noConnection}
          </Badge>
        </KitCell>
      </KitSection>

      <KitSection title={t.plate}>
        <KitCell caption="lg">
          <Badge size="lg">{t.youAreOut}</Badge>
        </KitCell>
      </KitSection>

      <KitSection title={t.whereNow}>
        <KitCell caption="warning">
          <Badge tone="warning" size="md" outlined>
            {t.inGame}
          </Badge>
        </KitCell>
        <KitCell caption="success">
          <Badge tone="success" size="md" outlined>
            {t.onStats}
          </Badge>
        </KitCell>
        <KitCell caption="info">
          <Badge tone="info" size="md" outlined>
            {t.inLobby}
          </Badge>
        </KitCell>
        <KitCell caption="muted">
          <Badge tone="muted" size="md" outlined>
            {t.offline}
          </Badge>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
