import { useState, useEffect } from "react";
import { TitleBar } from "@/components/title-bar";
import { Chat } from "@/components/chat/chat";

function useMaximized() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});
    api.onMaximize(() => setIsMaximized(true));
    api.onUnmaximize(() => setIsMaximized(false));
  }, []);

  return isMaximized;
}

function App() {
  const isMaximized = useMaximized();

  return (
    <div className={`h-screen w-screen ${isMaximized ? "" : "p-1.5"}`}>
      <div
        className={[
          "flex h-full flex-col overflow-hidden bg-background",
          isMaximized
            ? ""
            : "rounded-xl border border-border/50 shadow-lg shadow-black/10",
        ].join(" ")}
      >
        <TitleBar />
        <Chat />
      </div>
    </div>
  );
}

export default App;
