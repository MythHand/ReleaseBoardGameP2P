import 'i18next'
import type enCommon from './locales/en/common.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: { common: typeof enCommon }
  }
}
