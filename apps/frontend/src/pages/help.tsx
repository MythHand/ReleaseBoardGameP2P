import { useTranslation } from '@release/translation'
import { Link } from 'react-router'

export default function HelpPage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="font-bold text-3xl tracking-base">{t('help.title')}</h1>
      <Link to="/start" className="text-brand-green underline">
        {t('help.back')}
      </Link>
    </main>
  )
}
