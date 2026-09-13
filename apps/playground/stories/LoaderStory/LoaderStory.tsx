import { useState } from 'react'
import Loader from '@/boot'
import styles from './LoaderStory.module.css'

// The loader on its own. It starts from the question — YES is also the click the
// browser needs before it plays sound. Once the logo has faded the loader is
// mounted afresh, so every run starts from the question again.
export default function LoaderStory() {
  const [run, setRun] = useState(0)
  return (
    <div className={styles.root}>
      <Loader key={run} onDone={() => setRun((n) => n + 1)} />
    </div>
  )
}
