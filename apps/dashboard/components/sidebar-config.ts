import {
  Home01Icon,
  Calendar03Icon,
  UserMultiple02Icon,
  Stethoscope02Icon,
  Settings02Icon,
  MoneyBag02Icon,
  Invoice02Icon,
  ShieldKeyIcon,
  AnalyticsUpIcon,
  AiChat02Icon,
  Notification03Icon,
  Coupon01Icon,
  Building06Icon,
  DocumentValidationIcon,
  PaintBrush01Icon,
  StarIcon,
  Activity01Icon,
  Layers01Icon,
  Location01Icon,
  Briefcase01Icon,
  InboxIcon,
  CreditCardIcon,
} from "@hugeicons/core-free-icons"
import { FeatureKey } from "@deqah/shared/constants"

export interface NavItem {
  titleKey: string
  href: string
  icon: typeof Home01Icon
  badge?: number
  permission?: string // "module:action" — item hidden if user lacks this permission
  featureFlag?: FeatureKey // hide if feature flag is disabled for this org's plan
}

export interface NavGroup {
  labelKey: string
  items: NavItem[]
}

export const overviewNav: NavItem[] = [
  { titleKey: "nav.dashboard", href: "/", icon: Home01Icon },
]

export const operationsNav: NavItem[] = [
  { titleKey: "nav.bookings", href: "/bookings", icon: Calendar03Icon },
  { titleKey: "nav.clients", href: "/clients", icon: UserMultiple02Icon },
  { titleKey: "nav.ratings", href: "/ratings", icon: StarIcon },
  { titleKey: "nav.contactMessages", href: "/contact-messages", icon: InboxIcon },
]

export const peopleNav: NavItem[] = [
  { titleKey: "nav.employees", href: "/employees", icon: Stethoscope02Icon },
  { titleKey: "nav.users", href: "/users", icon: ShieldKeyIcon },
]

export const financeNav: NavItem[] = [
  { titleKey: "nav.payments", href: "/payments", icon: MoneyBag02Icon },
  // TAR-70: stubbed — restore when useInvoices hook is implemented
  // { titleKey: "nav.invoices", href: "/invoices", icon: Invoice02Icon },
  { titleKey: "nav.coupons", href: "/coupons", icon: Coupon01Icon, featureFlag: FeatureKey.COUPONS },
  { titleKey: "nav.reports", href: "/reports", icon: AnalyticsUpIcon, featureFlag: FeatureKey.ADVANCED_REPORTS },
]

export const catalogNav: NavItem[] = [
  { titleKey: "nav.services", href: "/services", icon: Briefcase01Icon },
  { titleKey: "nav.categories", href: "/categories", icon: Layers01Icon },
  { titleKey: "nav.departments", href: "/departments", icon: Building06Icon },
  { titleKey: "nav.branches", href: "/branches", icon: Location01Icon, featureFlag: FeatureKey.BRANCHES },
  { titleKey: "nav.intakeForms", href: "/intake-forms", icon: DocumentValidationIcon, featureFlag: FeatureKey.INTAKE_FORMS },
]

export const systemNav: NavItem[] = [
  { titleKey: "nav.subscription", href: "/subscription", icon: CreditCardIcon },
  { titleKey: "nav.chatbot", href: "/chatbot", icon: AiChat02Icon, featureFlag: FeatureKey.AI_CHATBOT },
  { titleKey: "nav.notifications", href: "/notifications", icon: Notification03Icon },
  { titleKey: "nav.branding", href: "/branding", icon: PaintBrush01Icon, permission: "branding:edit" },
  { titleKey: "nav.content", href: "/content", icon: DocumentValidationIcon },
  { titleKey: "nav.activityLog", href: "/activity-log", icon: Activity01Icon, featureFlag: FeatureKey.ACTIVITY_LOG },
  { titleKey: "nav.settings", href: "/settings", icon: Settings02Icon },
]

export const navGroups: NavGroup[] = [
  { labelKey: "nav.overview", items: overviewNav },
  { labelKey: "nav.operations", items: operationsNav },
  { labelKey: "nav.people", items: peopleNav },
  { labelKey: "nav.finance", items: financeNav },
  { labelKey: "nav.catalog", items: catalogNav },
  { labelKey: "nav.system", items: systemNav },
]
