'use strict';

class GraphDiffEngine {
  diffGraphs(baseDoc, targetDoc) {
    const startTime = Date.now();

    const baseNodes = baseDoc['robos:nodes'] || [];
    const targetNodes = targetDoc['robos:nodes'] || [];

    const baseMap = new Map(baseNodes.map(n => [n['@id'], n]));
    const targetMap = new Map(targetNodes.map(n => [n['@id'], n]));

    const addedNodes = [];
    const removedNodes = [];
    const modifiedNodes = [];
    const unchangedNodes = [];

    // 1. Identify added and modified nodes
    for (const [id, targetNode] of targetMap.entries()) {
      if (!baseMap.has(id)) {
        addedNodes.push(targetNode);
      } else {
        const baseNode = baseMap.get(id);
        const propDiffs = this.compareNodeProps(baseNode, targetNode);
        if (propDiffs.length > 0) {
          modifiedNodes.push({
            node: targetNode,
            baseNode,
            changes: propDiffs,
          });
        } else {
          unchangedNodes.push(targetNode);
        }
      }
    }

    // 2. Identify removed nodes
    for (const [id, baseNode] of baseMap.entries()) {
      if (!targetMap.has(id)) {
        removedNodes.push(baseNode);
      }
    }

    // 3. Compute Risk Assessment
    let breakingChangesCount = 0;
    for (const removed of removedNodes) {
      const types = Array.isArray(removed['@type']) ? removed['@type'] : [removed['@type']];
      if (types.some(t => t.includes('Contract') || t.includes('Microservice'))) {
        breakingChangesCount++;
      }
    }

    const riskLevel = breakingChangesCount > 0 ? 'HIGH' :
                      modifiedNodes.length > 3 ? 'MEDIUM' : 'LOW';

    const durationMs = Date.now() - startTime;

    return {
      baseGraphId: baseDoc['@id'],
      targetGraphId: targetDoc['@id'],
      durationMs,
      summary: {
        addedCount: addedNodes.length,
        removedCount: removedNodes.length,
        modifiedCount: modifiedNodes.length,
        unchangedCount: unchangedNodes.length,
        breakingChangesCount,
        riskLevel,
      },
      addedNodes,
      removedNodes,
      modifiedNodes,
      unchangedNodes,
    };
  }

  compareNodeProps(nodeA, nodeB) {
    const diffs = [];
    const allKeys = new Set([...Object.keys(nodeA), ...Object.keys(nodeB)]);

    for (const key of allKeys) {
      if (key === '@id') continue;
      const valA = JSON.stringify(nodeA[key]);
      const valB = JSON.stringify(nodeB[key]);
      if (valA !== valB) {
        diffs.push({
          property: key,
          oldValue: nodeA[key] !== undefined ? nodeA[key] : null,
          newValue: nodeB[key] !== undefined ? nodeB[key] : null,
        });
      }
    }

    return diffs;
  }
}

module.exports = { GraphDiffEngine };
