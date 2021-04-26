import { VariableDeclarationStatement } from "@solidity-parser/parser/dist/ast-types";

import { Location, FinderType, Node } from "./Node";

export class VariableDeclarationStatementNode implements Node {
    type: string;
    uri: string;
    astNode: VariableDeclarationStatement;

    nameLoc?: Location | undefined;

    parent?: Node | undefined;
    children: Node[] = [];

    typeNodes: Node[] = [];

    constructor (variableDeclarationStatement: VariableDeclarationStatement, uri: string) {
        this.type = variableDeclarationStatement.type;
        this.uri = uri;
        this.astNode = variableDeclarationStatement;
        // TO-DO: Implement name location for rename
    }

    getTypeNodes(): Node[] {
        return [];
    }

    getName(): string | undefined {
        return undefined;
    }

    addChild(child: Node): void {
        this.children.push(child);
    }

    setParent(parent: Node): void {
        this.parent = parent;
    }

    accept(find: FinderType, orphanNodes: Node[], parent?: Node): Node {
        // TO-DO: Method not implemented
        return this;
    }
}