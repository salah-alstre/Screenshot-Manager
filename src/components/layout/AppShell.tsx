import { useTranslation } from "react-i18next";
import { Editor } from "@/features/editor/Editor";
import { GlobalDialogs } from "@/features/dialogs/Dialogs";
import { DropOverlay } from "@/features/dropzone/DropOverlay";
import { CommandPalette } from "@/features/palette/CommandPalette";
import { Viewer } from "@/features/viewer/Viewer";
import { useBackendEvents, useGlobalKeys } from "@/hooks/useAppEffects";
import { useSettings } from "@/hooks/useSettings";
import { CollectionsPage } from "@/pages/CollectionsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DuplicatesPage } from "@/pages/DuplicatesPage";
import { CollectionPage, LibraryScopePage, SearchPage, TagPage, TrashPage } from "@/pages/LibraryPages";
import { OcrSearchPage } from "@/pages/OcrSearchPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StoragePage } from "@/pages/StoragePage";
import { TagsPage } from "@/pages/TagsPage";
import { routeKey, useUi, type Route } from "@/stores/ui";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "dashboard":
      return <DashboardPage />;
    case "library":
      return <LibraryScopePage scope={route.scope} />;
    case "search":
      return <SearchPage query={route.query} />;
    case "collection":
      return <CollectionPage id={route.id} />;
    case "tag":
      return <TagPage id={route.id} />;
    case "collections":
      return <CollectionsPage />;
    case "tags":
      return <TagsPage />;
    case "ocr":
      return <OcrSearchPage />;
    case "trash":
      return <TrashPage />;
    case "settings":
      return <SettingsPage section={route.section} />;
    case "storage":
      return <StoragePage />;
    case "duplicates":
      return <DuplicatesPage />;
  }
}

export function AppShell() {
  const { t } = useTranslation();
  const settings = useSettings();
  const route = useUi((s) => s.route);
  useBackendEvents();
  useGlobalKeys(settings);

  return (
    <div className="flex h-full bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[200] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {t("common.skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" key={route.page === "settings" ? "settings" : routeKey(route)} className="relative min-h-0 flex-1 animate-fade-in overflow-hidden">
          <Page route={route} />
        </main>
      </div>
      <Viewer />
      <Editor />
      <CommandPalette />
      <GlobalDialogs />
      <DropOverlay />
    </div>
  );
}
