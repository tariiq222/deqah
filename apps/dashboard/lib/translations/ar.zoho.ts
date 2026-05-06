export const arZoho: Record<string, string> = {
  "zoho.menuLabel": "زوهو للفواتير",
  "zoho.title": "تكامل Zoho Invoice",
  "zoho.description":
    "بعد إتمام الدفع نُصدر فاتورة لكل عميل في حساب Zoho Invoice الخاص بالمنشأة ونرسل له الرابط. الاشتراكات تبقى داخل دِقة — زوهو لإصدار الفاتورة فقط.",

  "zoho.notConnected.title": "غير مربوط",
  "zoho.notConnected.body":
    "اربط حسابك في Zoho Invoice ليتم إصدار فاتورة لكل دفعة ناجحة وإرسال الرابط للعميل.",
  "zoho.notConnected.dcLabel": "مركز بيانات زوهو",
  "zoho.notConnected.dcHint": "للسعودية اختر sa. تأكد أن العملة في زوهو ريال سعودي.",
  "zoho.notConnected.connect": "ربط Zoho",
  "zoho.notConnected.connecting": "جارٍ التحضير...",

  "zoho.status.connected": "تم الربط",
  "zoho.status.inactive": "موقوف — أعد الربط",
  "zoho.status.pendingOrgSelect": "اختر منظمة Zoho",
  "zoho.status.org": "منظمة Zoho",
  "zoho.status.dc": "مركز البيانات",
  "zoho.status.webhookUrl": "رابط الـ Webhook (الصقه في إعدادات زوهو)",
  "zoho.status.webhookHint":
    "في زوهو: Settings → Automation → Webhooks → New. ضع الرابط أعلاه واختر سرّ webhook اعتمدناه لك. سيمنع زوهو أي webhook غير موقّع.",

  "zoho.actions.test": "اختبار الاتصال",
  "zoho.actions.testing": "جارٍ الاختبار...",
  "zoho.actions.testOk": "✓ الاتصال يعمل",
  "zoho.actions.testFail": "تعذر التحقق: {error}",
  "zoho.actions.disconnect": "فصل الربط",
  "zoho.actions.disconnecting": "جارٍ الفصل...",
  "zoho.actions.disconnectConfirm":
    "هل تريد فصل ربط زوهو؟ الفواتير القائمة لن تُحذف لكن لن تُصدر فواتير جديدة.",

  "zoho.config.title": "إعدادات الفاتورة",
  "zoho.config.sendOnCreate": "إرسال الفاتورة بالبريد تلقائياً للعميل",
  "zoho.config.itemId": "معرف الصنف الافتراضي في زوهو (اختياري)",
  "zoho.config.itemIdHint": "اتركه فارغاً لاستخدام بنود مخصّصة لكل حجز.",
  "zoho.config.branchId": "معرف الفرع في زوهو (للمنظمات متعددة الفروع)",
  "zoho.config.paymentTerms": "نص شروط الدفع",
  "zoho.config.save": "حفظ التغييرات",
  "zoho.config.saving": "جارٍ الحفظ...",
  "zoho.config.saved": "تم الحفظ",

  "zoho.payments.title": "الفواتير الصادرة في زوهو لكل عميل",
  "zoho.payments.description":
    "كل دفعة ناجحة تنعكس كفاتورة في زوهو. اضغط الرابط لمشاهدة الفاتورة المرسلة للعميل أو إعادة إرسال البريد.",
  "zoho.payments.colDate": "التاريخ",
  "zoho.payments.colAmount": "المبلغ",
  "zoho.payments.colMethod": "وسيلة الدفع",
  "zoho.payments.colInvoice": "فاتورة دِقة",
  "zoho.payments.colZoho": "حالة زوهو",
  "zoho.payments.colActions": "إجراءات",
  "zoho.payments.zohoNotMirrored": "غير منعكسة",
  "zoho.payments.openInvoice": "فتح الفاتورة",
  "zoho.payments.openPdf": "PDF",
  "zoho.payments.resend": "إعادة إرسال",
  "zoho.payments.resending": "جارٍ الإرسال...",
  "zoho.payments.resent": "أُرسلت",
  "zoho.payments.empty": "لا توجد دفعات بعد.",
  "zoho.payments.filterClient": "العميل:",
  "zoho.payments.filterClear": "إزالة الفلتر",
  "zoho.payments.filterPlaceholder": "ابحث باسم العميل أو رقم الجوال...",
  "zoho.payments.filterSearching": "جارٍ البحث...",
  "zoho.payments.filterNoResults": "لا توجد نتائج مطابقة",

  "zoho.selectOrg.title": "اختر منظمة زوهو",
  "zoho.selectOrg.description":
    "حسابك مرتبط بأكثر من منظمة في زوهو. اختر التي تريد إصدار فواتيرك منها.",
  "zoho.selectOrg.confirm": "تأكيد",
  "zoho.selectOrg.placeholder": "أدخل معرف منظمة زوهو (organization_id)",

  "zoho.banner.reconnect": "ربط Zoho Invoice متوقف — الفواتير الجديدة لن تُصدر حتى تعيد الربط.",
  "zoho.banner.reconnectLink": "أعد الربط من الإعدادات",
}
