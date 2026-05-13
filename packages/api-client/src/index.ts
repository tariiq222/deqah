export { initClient, apiRequest, ApiError, ORG_SUSPENDED_CODE } from './client'
export type { ClientConfig } from './client'
export * from './types/index'
export * as authApi from './modules/auth'
export type { LoginPayload, LoginResponse, OrgSelectionResponse, OrgSelectionMembership } from './modules/auth'
export * as brandingApi from './modules/branding'
export * as bookingsApi from './modules/bookings'
export * as clientsApi from './modules/clients'
export * as employeesApi from './modules/employees'
export * as servicesApi from './modules/services'
export * as branchesApi from './modules/branches'
export * as departmentsApi from './modules/departments'
export * as availabilityApi from './modules/availability'
export * as ratingsApi from './modules/ratings'
export * as paymentsApi from './modules/payments'
export * as invoicesApi from './modules/invoices'
export * as couponsApi from './modules/coupons'
export * as intakeFormsApi from './modules/intake-forms'
export * as notificationsApi from './modules/notifications'
export * as reportsApi from './modules/reports'
export * as groupsApi from './modules/groups'
export * as usersApi from './modules/users'
export * as organizationSettingsApi from "./modules/organization-settings"
export type { OrganizationSettings, UpdateOrganizationSettingsPayload } from "./modules/organization-settings"
export * as publicEmployeesApi from './modules/public-employees'
export * as publicBranchesApi from './modules/public-branches'
export * as contactMessagesApi from './modules/contact-messages'
export * as otpApi from './modules/otp'
export * as publicAvailabilityApi from './modules/public-availability'
export * as groupSessionsApi from './modules/group-sessions'
export * as mediaApi from './modules/media'
export * as orgSmsConfigApi from './modules/org-sms-config'
export * as zoomApi from './modules/zoom'
export { setOtpSessionToken, getOtpSessionToken, setGuestBaseUrl } from './modules/guest-client'
export {
  setClientBaseUrl,
  initClientAuth,
  clientLogin,
  clientRegister,
  clientRefresh,
  clientLogout,
  clientResetPassword,
} from './modules/client-auth'
export {
  setMeBaseUrl,
  getMe,
  getMyBookings,
  cancelMyBooking,
  rescheduleMyBooking,
} from './modules/me'
