import Badge from '@/primitives/Badge'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Badge: тоны, обводка, размеры — статусы и роли с экранов.
export default function BadgesKit() {
  return (
    <KitPage title="Badges">
      <KitSection title="Роли">
        <KitCell caption="host (outlined sm)">
          <Badge tone="success" size="sm" outlined>
            host
          </Badge>
        </KitCell>
        <KitCell caption="spectator (muted)">
          <Badge tone="muted">зритель</Badge>
        </KitCell>
      </KitSection>

      <KitSection title="Статус готовности">
        <KitCell caption="ready (success)">
          <Badge tone="success">готов</Badge>
        </KitCell>
        <KitCell caption="waiting (muted)">
          <Badge tone="muted">ожидание</Badge>
        </KitCell>
        <KitCell caption="offline (muted)">
          <Badge tone="muted">не в сети</Badge>
        </KitCell>
      </KitSection>

      <KitSection title="Статус за столом (sm)">
        <KitCell caption="eliminated (muted)">
          <Badge tone="muted" size="sm">
            выбыл
          </Badge>
        </KitCell>
        <KitCell caption="disconnected (danger)">
          <Badge tone="danger" size="sm">
            нет связи
          </Badge>
        </KitCell>
      </KitSection>

      <KitSection title="Плашка (lg) — тёмный фон + рамка, напр. «вы выбыли»">
        <KitCell caption="lg">
          <Badge size="lg">вы выбыли из игры</Badge>
        </KitCell>
      </KitSection>

      <KitSection title="«Где сейчас» — outlined md, все тона">
        <KitCell caption="warning">
          <Badge tone="warning" size="md" outlined>
            в игре
          </Badge>
        </KitCell>
        <KitCell caption="success">
          <Badge tone="success" size="md" outlined>
            на статистике
          </Badge>
        </KitCell>
        <KitCell caption="info">
          <Badge tone="info" size="md" outlined>
            в лобби
          </Badge>
        </KitCell>
        <KitCell caption="muted">
          <Badge tone="muted" size="md" outlined>
            не в сети
          </Badge>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
