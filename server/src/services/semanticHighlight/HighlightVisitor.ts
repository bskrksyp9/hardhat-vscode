/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { TextDocument } from "vscode-languageserver-textdocument";
import { SlangNode } from "../../parser/slangHelpers";
import { SemanticTokensBuilder } from "./SemanticTokensBuilder";

// Abstraction for a visitor that wants to highlight tokens
export abstract class HighlightVisitor {
  constructor(
    public document: TextDocument,
    public tokenBuilder: SemanticTokensBuilder
  ) {}

  public enter(node: SlangNode, ancestors: SlangNode[]): void {}
  public exit(node: SlangNode, ancestors: SlangNode[]): void {}
}
