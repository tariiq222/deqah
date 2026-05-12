/**
 * Arabic translations — Phase 5 modules
 * (chatbot config/kb/analytics, activity log columns, intake forms, reports combobox)
 */

export const arChatbotExtended: Record<string, string> = {
  // ─── إعدادات الشات بوت ───
  "chatbot.config.category.personality": "الشخصية",
  "chatbot.config.category.rules": "القواعد",
  "chatbot.config.category.handoff": "التحويل",
  "chatbot.config.category.sync": "المزامنة",
  "chatbot.config.category.ai": "إعدادات الذكاء الاصطناعي",
  "chatbot.config.category.general": "عام",
  "chatbot.config.category.other": "أخرى",
  "chatbot.config.save": "حفظ",
  "chatbot.config.saving": "جاري الحفظ...",
  "chatbot.config.saved": "تم حفظ الإعدادات",
  "chatbot.config.saveError": "فشل الحفظ",
  "chatbot.config.empty": "لا توجد إعدادات.",

  // ─── قاعدة معرفة الشات بوت (موسّعة) ───
  "chatbot.kb.entryDeleted": "تم حذف المدخل",
  "chatbot.kb.deleteFailed": "فشل الحذف",
  "chatbot.kb.syncedCount": "تمت مزامنة {n} مدخل",
  "chatbot.kb.syncFailed": "فشلت المزامنة",
  "chatbot.kb.fileUploaded": "تم رفع الملف",
  "chatbot.kb.uploadFailed": "فشل الرفع",
  "chatbot.kb.fileProcessed": "تمت معالجة الملف",
  "chatbot.kb.processFailed": "فشلت المعالجة",
  "chatbot.kb.fileDeleted": "تم حذف الملف",
  "chatbot.kb.noFiles": "لا توجد ملفات مرفوعة",
  "chatbot.kb.filesTitle": "الملفات",
  "chatbot.kb.uploading": "جاري الرفع...",
  "chatbot.kb.syncing": "جاري المزامنة...",

  // ─── تحليلات الشات بوت (موسّعة) ───
  "chatbot.analytics.totalMessages": "إجمالي الرسائل",
  "chatbot.analytics.noQuestions": "لم تُسجَّل أسئلة بعد",

  // ─── تسميات الأدوار ───
  "chatbot.role.user": "المستفيد",
  "chatbot.role.client": "المستفيد",
  "chatbot.role.assistant": "الذكاء الاصطناعي",
  "chatbot.role.bot": "الذكاء الاصطناعي",
  "chatbot.role.system": "النظام",
  "chatbot.role.staff": "الموظف",

  // ─── أعمدة سجل النشاط ───
  "activityLog.col.user": "المستخدم",
  "activityLog.col.action": "الإجراء",
  "activityLog.col.module": "الوحدة",
  "activityLog.col.description": "الوصف",
  "activityLog.col.resource": "المرجع",
  "activityLog.col.time": "الوقت",
  "activityLog.system": "النظام",
  "activityLog.action.created": "إنشاء",
  "activityLog.action.updated": "تحديث",
  "activityLog.action.deleted": "حذف",
  "activityLog.action.login": "تسجيل دخول",
  "activityLog.action.logout": "تسجيل خروج",
  "activityLog.action.approved": "موافقة",
  "activityLog.action.rejected": "رفض",

  // ─── نماذج المعلومات ───
  "intakeForms.title": "نماذج المعلومات",
  "intakeForms.description": "إدارة النماذج التي يملؤها المستفيدون قبل وبعد الجلسات",
  "intakeForms.searchPlaceholder": "بحث في النماذج...",
  "intakeForms.newForm": "إنشاء نموذج",
  "intakeForms.stats.total": "إجمالي النماذج",
  "intakeForms.stats.active": "النماذج النشطة",
  "intakeForms.stats.submissions": "إجمالي الإرسالات",
  "intakeForms.empty.title": "لا توجد نماذج",
  "intakeForms.empty.description": "أنشئ نموذجك الأول لجمع معلومات المستفيدين",
  "intakeForms.deleteSuccess": "تم حذف النموذج",
  "intakeForms.deleteError": "فشل الحذف",
  "intakeForms.activateSuccess": "تم تفعيل النموذج",
  "intakeForms.deactivateSuccess": "تم إيقاف النموذج",
  "intakeForms.updateError": "فشل التحديث",
  "intakeForms.featureDisabled": "هذه الميزة غير متاحة في خطتك الحالية. يرجى الترقية للوصول إلى نماذج المعلومات.",

  // ─── التقارير — اختيار الممارس ───
  "reports.selectEmployee": "اختر ممارساً",
  "reports.searchEmployee": "ابحث عن ممارس...",
  "reports.noEmployeeFound": "لم يُعثر على ممارس",
}
