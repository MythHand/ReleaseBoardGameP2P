import { makeStats } from '@/mocks/stats'
import Stats from '@/screens/Stats'
import { RU_STATS } from '../ru-copy'
import styles from './StatsStory.module.css'

export default function StatsStory() {
  const data = makeStats()
  return (
    <div className={styles.root}>
      <Stats {...data} copy={RU_STATS} />
    </div>
  )
}
