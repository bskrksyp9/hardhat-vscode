import { Position, Node, ContractDefinitionNode, ImportDirectiveNode, SourceUnitNode } from "@nodes/Node";

export let projectRootPath: string | undefined;

export function setProjectRootPath(rootPath: string | undefined) {
    if (rootPath && rootPath.indexOf('file://') !== -1) {
        rootPath = rootPath.replace("file://", "");
    }

    if (rootPath) {
        rootPath = decodeURIComponent(rootPath);
    }

    projectRootPath = rootPath;
}

export let analyzerTree: Node | undefined;

export function setRoot(rootNode: Node) {
    analyzerTree = rootNode;
}

export function findParent(node: Node, from?: Node, searchInInheretenceNodes?: boolean): Node | undefined {
    let parent: Node | undefined;

    // If from Node doesn't exist start finding from the root of the analyzer tree
    if (!from) {
        parent = search(node, analyzerTree, searchInInheretenceNodes);
    } else {
        parent = search(node, from, searchInInheretenceNodes);
    }

    if (parent) {
        node.setAliasName(parent.getAliasName());

        parent = parent.getDefinitionNode();
    }

    // If the parent uri and node uri are not the same, add the node to the exportNode field
    if (parent && parent.uri !== node.uri) {
        const exportRootNode = findSourceUnitNode(parent);
        const importRootNode = findSourceUnitNode(analyzerTree);

        if (exportRootNode) {
            exportRootNode.addExportNode(node);
        }

        if (importRootNode) {
            importRootNode.addImportNode(node);
        }
    }

    return parent;
}

export function findNodeByPosition(uri: string, position: Position, from?: Node, returnDefinitionNode = true, searchInExpression = false): Node | undefined {
    const node = walk(uri, position, from || analyzerTree, searchInExpression);

    if (node && returnDefinitionNode) {
        return node.getDefinitionNode();
    }

    return node;
}

export function findChildren(definitionNode: Node, orphanNodes: Node[], isShadowed = true): void {
    const newOrphanNodes: Node[] = [];
    const expressionNodes: Node[] = [];

    let orphanNode = orphanNodes.shift();
    while (orphanNode) {
        if (
            (!isShadowed ||
            (isShadowed && isNodeShadowedByNode(orphanNode, definitionNode))) &&
            isNodeConnectable(definitionNode, orphanNode)
        ) {
            orphanNode.addTypeNode(definitionNode);

            orphanNode.setParent(definitionNode);
            definitionNode.addChild(orphanNode);

            expressionNodes.push(orphanNode);
        } else {
            newOrphanNodes.push(orphanNode);
        }

        orphanNode = orphanNodes.shift();
    }

    // Return to orphanNodes array unhandled orphan nodes
    for (const newOrphanNode of newOrphanNodes) {
        orphanNodes.push(newOrphanNode);
    }

    // Find type references for all expressions
    for (const expressionNode of expressionNodes) {
        findExpressionNodes(definitionNode, expressionNode, orphanNodes);
    }
}

function findExpressionNodes(definitionNode: Node, node: Node, orphanNodes: Node[]): void {
    const newOrphanNodes: Node[] = [];
    let declarationNode = node.getDeclarationNode();

    if (!declarationNode) {
        if (node.getExpressionNode()) {
            declarationNode = node;
        } else {
            return;
        }
    }

    let orphanNode = orphanNodes.shift();
    while (orphanNode) {

        if (matchNodeExpression(orphanNode, declarationNode)) {
            for (const definitionChild of definitionNode.children) {

                if (definitionChild.getName() && definitionChild.getName() === orphanNode.getName()) {
                    orphanNode.addTypeNode(definitionChild);

                    orphanNode.setParent(definitionChild);
                    definitionChild?.addChild(orphanNode);

                    nestNode(orphanNode, orphanNodes);
                }
            }
        } else {
            newOrphanNodes.push(orphanNode);
        }

        orphanNode = orphanNodes.shift();
    }

    for (const newOrphanNode of newOrphanNodes) {
        orphanNodes.push(newOrphanNode);
    }
}

function nestNode(node: Node, orphanNodes: Node[]): void {
    const expressionNode = getMemberAccessNodeFromExpression(node);
    if (!expressionNode) {
        return;
    }

    const orphanNode = orphanNodes.shift();
    if (!orphanNode) {
        return;
    }

    if (isNodeEqual(expressionNode, orphanNode)) {
        for (const definitionType of node.getTypeNodes()) {
            for (const definitionChild of definitionType.children) {
                if (definitionChild.getName() && definitionChild.getName() === orphanNode.getName()) {
                    orphanNode.addTypeNode(definitionChild);

                    orphanNode.setParent(definitionChild);
                    definitionChild?.addChild(orphanNode);

                    nestNode(orphanNode, orphanNodes);
                }
            }
        }
    } else {
        orphanNodes.unshift(orphanNode);
    }
}

function search(node: Node, from?: Node | undefined, searchInInheretenceNodes?: boolean, visitedNodes?: Node[], visitedFiles?: string[]): Node | undefined {
    if (!visitedNodes) {
        visitedNodes = [];
    }

    if (!visitedFiles) {
        visitedFiles = [];
    }

    if (!from) {
        return undefined;
    }

    if (visitedNodes.indexOf(from) !== -1) {
        return undefined;
    }

    // Add as visited node
    visitedNodes.push(from);

    let parent: Node | undefined;
    if (isNodeConnectable(from, node)) {
        return from;
    }

    for (const child of from.children) {
        if (from.type !== "AssemblyFor" && child.type !== "ImportDirective" && !isNodeShadowedByNode(node, child)) {
            if (isNodeConnectable(child, node)) {
                return child;
            }

            continue;
        }

        parent = search(node, child, searchInInheretenceNodes, visitedNodes);

        if (parent) {
            return parent;
        }
    }

    // Handle inheritance
    if (searchInInheretenceNodes && from.type === "ContractDefinition") {
        const inheritanceNodes = (from as ContractDefinitionNode).getInheritanceNodes();

        for (let i = inheritanceNodes.length - 1; i >= 0; i--) {
            const inheritanceNode = inheritanceNodes[i];

            if (isNodeConnectable(inheritanceNode, node)) {
                return inheritanceNode;
            }

            parent = search(node, inheritanceNode, searchInInheretenceNodes, visitedNodes);

            if (parent) {
                return parent;
            }
        }
    }

    // Handle import
    const matched = searchInImportNodes(visitedFiles, node, from);
    if (matched) {
        return matched;
    }

    return search(node, from.parent, searchInInheretenceNodes, visitedNodes);
}

function searchInImportNodes(visitedFiles: string[], node: Node, from?: Node | undefined): Node | undefined {
    if (!from) {
        return undefined;
    }

    if (from.type === "ImportDirective") {
        const importNode = (from as ImportDirectiveNode).getImportNode();
        const importAliasNodes = (from as ImportDirectiveNode).getAliasNodes();

        if (importNode && visitedFiles.indexOf(importNode.uri) === -1) {
            // Add as visited file
            visitedFiles.push(importNode.uri);

            if (importAliasNodes.length > 0) {
                for (const importAliasNode of importAliasNodes) {
                    if (importAliasNode && node &&
                        importAliasNode.getName() && node.getName() &&
                        importAliasNode.getName() === node.getName()
                    ) {
                        return importAliasNode;
                    }
                }
            } else {
                for (const child of importNode?.children || []) {
                    const matched = searchInImportNodes(visitedFiles, node, child);
    
                    if (matched) {
                        return matched;
                    }
    
                    if (isNodeConnectable(child, node)) {
                        return child;
                    }
                }
            }
        }
    }
}

function searchInExpressionNode(uri: string, position: Position, expressionNode?: Node | undefined): Node | undefined {
    if (!expressionNode) {
        return undefined;
    }

    if (
        isNodePosition(expressionNode, position) &&
        (expressionNode.uri === uri ||
        (expressionNode.type === "ImportDirective" && (expressionNode as ImportDirectiveNode).realURI === uri))
    ) {
        return expressionNode;
    }

    searchInExpressionNode(uri, position, expressionNode.getExpressionNode());
}

function walk(uri: string, position: Position, from?: Node, searchInExpression?: boolean, visitedNodes?: Node[], visitedFiles?: string[]): Node | undefined {
    if (!visitedNodes) {
        visitedNodes = [];
    }

    if (!visitedFiles) {
        visitedFiles = [];
    }

    if (!from) {
        return undefined;
    }

    if (visitedNodes.indexOf(from) !== -1) {
        return undefined;
    }

    // Add as visited node
    visitedNodes.push(from);

    if (
        isNodePosition(from, position) &&
        (from.uri === uri ||
        (from.type === "ImportDirective" && (from as ImportDirectiveNode).realURI === uri))
    ) {
        return from;
    }

    // Handle import
    if (from.type === "ImportDirective") {
        const importNode = (from as ImportDirectiveNode).getImportNode();
        const importAliasNodes = (from as ImportDirectiveNode).getAliasNodes();

        if (importNode && visitedFiles.indexOf(importNode.uri) === -1) {
            // Add as visited file
            visitedFiles.push(importNode.uri);

            let parent: Node | undefined = undefined;
            if (importAliasNodes.length > 0) {
                for (const importAliasNode of importAliasNodes) {
                    parent = walk(uri, position, importAliasNode, searchInExpression, visitedNodes, visitedFiles);

                    if (parent) {
                        break;
                    }
                }
            } else {
                parent = walk(uri, position, importNode, searchInExpression, visitedNodes, visitedFiles);
            }

            if (parent) {
                return parent;
            }
        }
    }

    for (const child of from.children) {
        const parent = walk(uri, position, child, searchInExpression, visitedNodes, visitedFiles);

        if (parent) {
            return parent;
        }
    }

    if (searchInExpression) {
        const expressionNode = searchInExpressionNode(uri, position, from.getExpressionNode());
        if (expressionNode) {
            return expressionNode;
        }
    }

    return walk(uri, position, from.parent, searchInExpression, visitedNodes, visitedFiles);
}

function matchNodeExpression(expression: Node, node: Node): boolean {
    let expressionNode = getMemberAccessNodeFromExpression(node);

    if (isNodeEqual(expressionNode, expression)) {
        return true;
    }

    for (const child of node.children) {
        expressionNode = getMemberAccessNodeFromExpression(child);

        if (isNodeEqual(expressionNode, expression)) {
            return true;
        }
    }

    return false;
}

function getMemberAccessNodeFromExpression(node: Node): Node | undefined {
    let expressionNode = node.getExpressionNode();

    while (expressionNode && expressionNode.type !== "MemberAccess") {
        expressionNode = expressionNode.getExpressionNode();
    }

    return expressionNode;
}

function isNodeEqual(first: Node | undefined, second: Node | undefined): boolean {
    if (
        first && second &&
        first.nameLoc && second.nameLoc &&
        JSON.stringify(first.nameLoc) === JSON.stringify(second.nameLoc) &&
        first.getName() === second.getName()
    ) {
        return true;
    }

    return false;
}

export function isNodePosition(node: Node, position: Position): boolean {
    if (
        node.nameLoc &&
        node.nameLoc.start.line === position.line &&
        node.nameLoc.end.line === position.line &&
        node.nameLoc.start.column <= position.column &&
        node.nameLoc.end.column >= position.column
    ) {
        return true;
    }

    return false;
}

export function isNodeShadowedByNode(child: Node | undefined, parent: Node | undefined): boolean {
    if (
        child && parent &&
        parent.astNode.range && child.astNode.range &&
        parent.astNode.range[0] < child.astNode.range[0] &&
        parent.astNode.range[1] > child.astNode.range[1]
    ) {
        return true;
    }

    return false;
}

export function isNodeConnectable(parent: Node | undefined, child: Node | undefined): boolean {
    if (
        parent && child &&
        parent.getName() && child.getName() &&
        (parent.getName() === child.getName() || parent.getName() === child.getAliasName()) && (
            parent.connectionTypeRules.includes(child.type) ||
            parent.connectionTypeRules.includes(child.getExpressionNode()?.type || "")
    )) {
        return true;
    }

    return false;
}

export function findSourceUnitNode(node: Node | undefined): SourceUnitNode | undefined {
    let rootNode = node;
    while (rootNode && rootNode.type !== "SourceUnit") {
        rootNode = rootNode.getParent();
    }

    if (rootNode?.type === "SourceUnit") {
        return (rootNode as SourceUnitNode);
    }

    return undefined;
}