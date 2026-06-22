import { makeStats } from '@/mocks/stats'
import Stats from '@/screens/Stats'
import styles from './StatsStory.module.css'

export default function StatsStory() {
  const data = makeStats()
  return (
    <div className={styles.root}>
      <Stats {...data} />
    </div>
  )
}
