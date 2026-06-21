import Start from '@/screens/Start'
import styles from './StartStory.module.css'

export default function StartStory() {
  return (
    <div className={styles.root}>
      <Start
        copy={{
          logoAlt: 'Release at any cost',
          tags: ['Open P2P project', 'Board card game'],
          description:
            'A strategic card game about the real grind of software development. Bugs, surprise events, rivals’ attacks — beat it all and release first.',
          createGame: 'create game',
          joinGame: 'join',
          videoReview: 'video overview',
          close: 'close',
          createTitle: 'Create game',
          createStub:
            'Match settings — mode selection (hand limit, Fast Release, release condition, etc.). Soon.',
          createCta: 'create',
          joinTitle: 'Join',
          gameCodeLabel: 'game code',
          gameCodePlaceholder: 'e.g. 4F2A-9K',
          joinCta: 'enter',
        }}
      />
    </div>
  )
}
