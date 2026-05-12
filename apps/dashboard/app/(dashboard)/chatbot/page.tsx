"use client"

import { ListPageShell } from "@/components/features/list-page-shell"
import { PageHeader } from "@/components/features/page-header"
import { Breadcrumbs } from "@/components/features/breadcrumbs"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import { FeatureGate } from "@/components/feature-gate"
import { FeatureKey } from "@deqah/shared/constants"
import { FeatureDisabledState } from "@/components/features/feature-disabled-state"

import { SessionsTab } from "@/components/features/chatbot/sessions-tab"
import { KnowledgeBaseTab } from "@/components/features/chatbot/knowledge-base-tab"
import { ConfigTab } from "@/components/features/chatbot/config-tab"

export default function ChatbotPage() {
  const { t } = useLocale()

  return (
    <FeatureGate
      feature={FeatureKey.AI_CHATBOT}
      fallback={
        <FeatureDisabledState
          title={t("chatbot.title")}
          description={t("chatbot.featureDisabled")}
        />
      }
    >
    <ListPageShell>
      <Breadcrumbs />

      <PageHeader
        title={t("chatbot.title")}
        description={t("chatbot.description")}
      />

      <Tabs defaultValue="sessions">
        <div className="overflow-x-auto">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="sessions">
              {t("chatbot.tabs.sessions")}
            </TabsTrigger>
            <TabsTrigger value="knowledgeBase">
              {t("chatbot.tabs.knowledgeBase")}
            </TabsTrigger>
            <TabsTrigger value="config">
              {t("chatbot.tabs.config")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>

        <TabsContent value="knowledgeBase">
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="config">
          <ConfigTab />
        </TabsContent>
      </Tabs>
    </ListPageShell>
    </FeatureGate>
  )
}
