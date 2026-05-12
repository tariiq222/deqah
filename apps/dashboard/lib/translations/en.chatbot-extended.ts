/**
 * English translations — Phase 5 modules
 * (chatbot config/kb/analytics, activity log columns, intake forms, reports combobox)
 */

export const enChatbotExtended: Record<string, string> = {
  // ─── Chatbot Config ───
  "chatbot.config.category.personality": "Personality",
  "chatbot.config.category.rules": "Rules",
  "chatbot.config.category.handoff": "Handoff",
  "chatbot.config.category.sync": "Sync",
  "chatbot.config.category.ai": "AI Settings",
  "chatbot.config.category.general": "General",
  "chatbot.config.category.other": "Other",
  "chatbot.config.save": "Save",
  "chatbot.config.saving": "Saving...",
  "chatbot.config.saved": "Configuration saved",
  "chatbot.config.saveError": "Failed to save",
  "chatbot.config.empty": "No configuration entries found.",

  // ─── Chatbot Knowledge Base (extended) ───
  "chatbot.kb.entryDeleted": "Entry deleted",
  "chatbot.kb.deleteFailed": "Failed to delete",
  "chatbot.kb.syncedCount": "Synced {n} entries",
  "chatbot.kb.syncFailed": "Sync failed",
  "chatbot.kb.fileUploaded": "File uploaded",
  "chatbot.kb.uploadFailed": "Upload failed",
  "chatbot.kb.fileProcessed": "File processed",
  "chatbot.kb.processFailed": "Processing failed",
  "chatbot.kb.fileDeleted": "File deleted",
  "chatbot.kb.noFiles": "No files uploaded",
  "chatbot.kb.filesTitle": "Files",
  "chatbot.kb.uploading": "Uploading...",
  "chatbot.kb.syncing": "Syncing...",

  // ─── Chatbot Analytics (extended) ───
  "chatbot.analytics.totalMessages": "total messages",
  "chatbot.analytics.noQuestions": "No questions recorded yet",

  // ─── Session Role Labels ───
  "chatbot.role.user": "Client",
  "chatbot.role.client": "Client",
  "chatbot.role.assistant": "AI Bot",
  "chatbot.role.bot": "AI Bot",
  "chatbot.role.system": "System",
  "chatbot.role.staff": "Staff",

  // ─── Activity Log Columns ───
  "activityLog.col.user": "User",
  "activityLog.col.action": "Action",
  "activityLog.col.module": "Module",
  "activityLog.col.description": "Description",
  "activityLog.col.resource": "Resource",
  "activityLog.col.time": "Time",
  "activityLog.system": "System",
  "activityLog.action.created": "Created",
  "activityLog.action.updated": "Updated",
  "activityLog.action.deleted": "Deleted",
  "activityLog.action.login": "Login",
  "activityLog.action.logout": "Logout",
  "activityLog.action.approved": "Approved",
  "activityLog.action.rejected": "Rejected",

  // ─── Intake Forms ───
  "intakeForms.title": "Intake Forms",
  "intakeForms.description": "Manage forms filled by clients before and after sessions",
  "intakeForms.searchPlaceholder": "Search forms...",
  "intakeForms.newForm": "New Form",
  "intakeForms.stats.total": "Total Forms",
  "intakeForms.stats.active": "Active Forms",
  "intakeForms.stats.submissions": "Total Submissions",
  "intakeForms.empty.title": "No Forms Found",
  "intakeForms.empty.description": "Create your first form to collect client information",
  "intakeForms.deleteSuccess": "Form deleted",
  "intakeForms.deleteError": "Failed to delete",
  "intakeForms.activateSuccess": "Form activated",
  "intakeForms.deactivateSuccess": "Form deactivated",
  "intakeForms.updateError": "Failed to update",
  "intakeForms.featureDisabled": "This feature is not available on your current plan. Please upgrade to access intake forms.",

  // ─── Reports — Employee Combobox ───
  "reports.selectEmployee": "Select a employee",
  "reports.searchEmployee": "Search employees...",
  "reports.noEmployeeFound": "No employee found",
}
