import { WorkspaceFileRetriever } from "@analyzer/WorkspaceFileRetriever";
import { ServerState } from "../../types";
import { indexWorkspaceFolders } from "./indexWorkspaceFolders";

export const onInitialized = (
  serverState: ServerState,
  workspaceFileRetriever: WorkspaceFileRetriever
) => {
  const { logger } = serverState;

  return () => {
    logger.trace("onInitialized");

    if (serverState.workspaceFolders.length === 0) {
      throw new Error("Workspace folders not set");
    }

    serverState.telemetry.trackTimingSync("indexing", () => {
      indexWorkspaceFolders(serverState, workspaceFileRetriever);
    });

    if (serverState.hasWorkspaceFolderCapability) {
      serverState.connection.workspace.onDidChangeWorkspaceFolders(() => {
        logger.trace("Workspace folder change event received.");
      });
    }

    logger.info("Language server ready");
  };
};