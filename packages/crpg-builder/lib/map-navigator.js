'use strict';

const fs = require('fs');
const path = require('path');

/**
 * RobOS cRPG Map Navigator & Traversal Engine (Contract-First)
 *
 * Implements deterministic spatial and narrative navigation across CRPG campaigns:
 * 1. Initial Scene & Party Spawn Resolution (What map appears first?)
 * 2. Spatial Map Connections & Door/Stairs Traversal (What maps are connected to that map?)
 * 3. Lock, Key & Story Flag Gating (Magic Key, Story Flags, Permission Checks)
 * 4. Action / Story Event Transports (What if an action/event transports the PCs somewhere?)
 * 5. Full Map Topology Graph Validation & Reachability (Contract Verification)
 */
class CRPGMapNavigator {
  constructor(options = {}) {
    this.mapsDir = options.mapsDir || path.resolve(__dirname, '../../../games/crpg-realm/maps');
    this.maps = new Map(); // slug or URN -> map JSON-LD node

    if (options.maps) {
      if (Array.isArray(options.maps)) {
        for (const m of options.maps) this.registerMap(m);
      } else if (typeof options.maps.forEach === 'function') {
        options.maps.forEach(m => this.registerMap(m));
      }
    } else if (fs.existsSync(this.mapsDir)) {
      this.loadMapsFromDir(this.mapsDir);
    }
  }

  static normalizeSlug(str) {
    if (!str) return '';
    return str.replace('urn:robos:crpg:battle-map:', '').trim();
  }

  static toUrn(slug) {
    if (!slug) return '';
    if (slug.startsWith('urn:robos:crpg:battle-map:')) return slug;
    return `urn:robos:crpg:battle-map:${slug}`;
  }

  registerMap(mapNode) {
    if (!mapNode) return;
    const id = mapNode['@id'] || mapNode.id || '';
    const slug = id ? CRPGMapNavigator.normalizeSlug(id) : (mapNode.slug || '');
    if (slug) this.maps.set(slug, mapNode);
    if (id) this.maps.set(id, mapNode);
  }

  loadMapsFromDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);
    for (const f of files) {
      if (f.endsWith('.jsonld') || f.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          this.registerMap(content);
        } catch {
          // Ignore invalid files
        }
      }
    }
  }

  getMap(slugOrUrn) {
    const slug = CRPGMapNavigator.normalizeSlug(slugOrUrn);
    return this.maps.get(slug) || this.maps.get(CRPGMapNavigator.toUrn(slug)) || null;
  }

  /**
   * 1. What map appears first?
   * Resolves the primary starting map, party spawn position, facing, and room description.
   */
  getStartingMap(campaign) {
    if (!campaign) throw new Error('Campaign object is required');

    const startingMapSlug = CRPGMapNavigator.normalizeSlug(
      campaign['robos:startingMap'] || campaign.startingMap ||
      campaign['robos:gameState']?.['robos:currentScene'] ||
      campaign.gameState?.currentScene || ''
    );

    if (!startingMapSlug) {
      throw new Error('Campaign does not declare a starting map (robos:startingMap)');
    }

    const mapNode = this.getMap(startingMapSlug);
    const spawnObj = campaign['robos:startingSpawn'] || campaign.startingSpawn || {};
    const defaultPosition = spawnObj.position ||
      campaign['robos:gameState']?.['robos:partyPosition'] ||
      campaign.gameState?.partyPosition || [10, 10];
    const defaultFacing = spawnObj.facing ||
      campaign['robos:gameState']?.['robos:facing'] ||
      campaign.gameState?.facing || 'south';
    const entryDesc = spawnObj.entryDescription ||
      `Party gathers in ${mapNode?.['dcterms:title'] || startingMapSlug}`;

    return {
      mapSlug: startingMapSlug,
      mapUrn: CRPGMapNavigator.toUrn(startingMapSlug),
      title: mapNode?.['dcterms:title'] || startingMapSlug,
      terrain: mapNode?.['robos:terrain'] || 'stone',
      width: mapNode?.['robos:width'] || 60,
      height: mapNode?.['robos:height'] || 40,
      spawn: defaultPosition,
      facing: defaultFacing,
      entryDescription: entryDesc,
      mapNode
    };
  }

  /**
   * 2. What maps are connected to that map?
   * Collects all spatial map transitions (stairs, doors, portals, road exits)
   * defined on the map's objects or registered in the campaign's robos:mapConnections.
   */
  getConnectedMaps(campaign, currentMapSlugOrUrn) {
    const currentSlug = CRPGMapNavigator.normalizeSlug(currentMapSlugOrUrn);
    const mapNode = this.getMap(currentSlug);
    const connections = [];

    // A. Parse map objects with robos:transition
    if (mapNode && Array.isArray(mapNode['robos:mapObjects'])) {
      for (const obj of mapNode['robos:mapObjects']) {
        const trans = obj['robos:transition'] || obj.transition;
        if (trans) {
          const rawTarget = trans['robos:targetMap'] || trans.targetMap || trans['robos:toMap'] || trans.toMap;
          if (rawTarget) {
            const targetSlug = CRPGMapNavigator.normalizeSlug(rawTarget);
            const targetMapNode = this.getMap(targetSlug);
            const toSpawn = trans['robos:targetSpawn'] || trans.targetSpawn || trans['robos:toSpawn'] || trans.toSpawn || [10, 10];
            const toFacing = trans['robos:targetFacing'] || trans.targetFacing || trans['robos:toFacing'] || trans.toFacing || 'south';
            const toObjectId = trans['robos:targetObjectId'] || trans.targetObjectId || trans['robos:toObjectId'] || trans.toObjectId || null;
            const transType = trans['robos:transitionType'] || trans.transitionType || obj['robos:objectType'] || obj.type || 'door';
            const reqKey = trans['robos:requiredKey'] || trans.requiredKey || null;
            const reqFlag = trans['robos:requiredFlag'] || trans.requiredFlag || null;
            const isTwoWay = trans['robos:twoWay'] !== false && trans.twoWay !== false && trans['robos:bidirectional'] !== false && trans.bidirectional !== false;
            const transMsg = trans['robos:transitionMessage'] || trans.transitionMessage || `Passing through ${obj['dcterms:title'] || obj['robos:objectId'] || 'passage'}...`;
            const lockMsg = trans['robos:lockedMessage'] || trans.lockedMessage || (reqKey ? `The passage is locked. Requires key: ${reqKey}.` : 'Locked.');

            connections.push({
              connectionId: `trans-${obj['robos:objectId'] || obj.id || 'obj'}`,
              fromMap: currentSlug,
              fromMapTitle: mapNode['dcterms:title'] || currentSlug,
              fromObjectId: obj['robos:objectId'] || obj.id,
              fromObjectType: obj['robos:objectType'] || obj.type || 'door',
              fromObjectLabel: obj['dcterms:title'] || obj.label || obj['robos:objectId'] || obj.id,
              fromPosition: obj['robos:position'] || [obj.x || 0, obj.y || 0],
              toMap: targetSlug,
              toMapUrn: CRPGMapNavigator.toUrn(targetSlug),
              toMapTitle: targetMapNode?.['dcterms:title'] || targetSlug,
              toObjectId,
              toSpawn,
              toFacing,
              transitionType: transType,
              bidirectional: isTwoWay,
              isLocked: !!(reqKey || reqFlag),
              requiredKey: reqKey,
              requiredFlag: reqFlag,
              label: trans['robos:label'] || trans.label || `Transition via ${obj['dcterms:title'] || obj['robos:objectId'] || 'exit'}`,
              transitionMessage: transMsg,
              lockedMessage: lockMsg
            });
          }
        }
      }
    }

    // B. Parse campaign-level robos:mapConnections
    const campConns = campaign?.['robos:mapConnections'] || campaign?.mapConnections || [];
    for (const c of campConns) {
      const fromSlug = CRPGMapNavigator.normalizeSlug(c['robos:fromMap'] || c.fromMap);
      const toSlug = CRPGMapNavigator.normalizeSlug(c['robos:toMap'] || c.toMap);
      const fromObjectId = c['robos:fromObjectId'] || c.fromObjectId || null;
      const toObjectId = c['robos:toObjectId'] || c.toObjectId || c['robos:returnObjectId'] || c.returnObjectId || null;
      const toSpawn = c['robos:toSpawn'] || c.toSpawn || [10, 10];
      const toFacing = c['robos:toFacing'] || c.toFacing || 'south';
      const transType = c['robos:transitionType'] || c.transitionType || 'door';
      const reqKey = c['robos:requiredKey'] || c.requiredKey || null;
      const reqFlag = c['robos:requiredFlag'] || c.requiredFlag || null;
      const isTwoWay = c['robos:bidirectional'] !== false && c.bidirectional !== false;
      const transMsg = c['robos:transitionMessage'] || c.transitionMessage || null;
      const lockMsg = c['robos:lockedMessage'] || c.lockedMessage || (reqKey ? `Locked. Requires key: ${reqKey}.` : 'Locked.');

      if (fromSlug === currentSlug) {
        // Check if not already added from map objects
        const exists = connections.some(existing =>
          existing.fromObjectId === fromObjectId && existing.toMap === toSlug
        );
        if (!exists) {
          const targetMapNode = this.getMap(toSlug);
          connections.push({
            connectionId: c.id || `conn-${fromObjectId || fromSlug}-to-${toSlug}`,
            fromMap: currentSlug,
            fromMapTitle: mapNode?.['dcterms:title'] || currentSlug,
            fromObjectId,
            fromObjectType: transType,
            fromObjectLabel: c.label || `${fromObjectId || 'Exit'} to ${toSlug}`,
            fromPosition: c.fromPosition || [0, 0],
            toMap: toSlug,
            toMapUrn: CRPGMapNavigator.toUrn(toSlug),
            toMapTitle: targetMapNode?.['dcterms:title'] || toSlug,
            toObjectId,
            toSpawn,
            toFacing,
            transitionType: transType,
            bidirectional: isTwoWay,
            isLocked: !!(reqKey || reqFlag),
            requiredKey: reqKey,
            requiredFlag: reqFlag,
            label: c.label || `Travel to ${toSlug}`,
            transitionMessage: transMsg || `Entering ${targetMapNode?.['dcterms:title'] || toSlug}...`,
            lockedMessage: lockMsg
          });
        }
      } else if (toSlug === currentSlug && isTwoWay) {
        // Two-way connection from another map arriving at current map
        const returnId = toObjectId || c['robos:returnObjectId'] || c.returnObjectId;
        const exists = connections.some(existing => existing.fromObjectId === returnId && existing.toMap === fromSlug);
        if (!exists && returnId) {
          const returnMapNode = this.getMap(fromSlug);
          connections.push({
            connectionId: `conn-return-${returnId}-to-${fromSlug}`,
            fromMap: currentSlug,
            fromMapTitle: mapNode?.['dcterms:title'] || currentSlug,
            fromObjectId: returnId,
            fromObjectType: transType,
            fromObjectLabel: `Return to ${returnMapNode?.['dcterms:title'] || fromSlug}`,
            fromPosition: toSpawn,
            toMap: fromSlug,
            toMapUrn: CRPGMapNavigator.toUrn(fromSlug),
            toMapTitle: returnMapNode?.['dcterms:title'] || fromSlug,
            toObjectId: fromObjectId,
            toSpawn: c.fromPosition || [10, 10],
            toFacing: c.fromFacing || 'north',
            transitionType: transType,
            bidirectional: true,
            isLocked: false,
            requiredKey: null,
            requiredFlag: null,
            label: `Return to ${fromSlug}`,
            transitionMessage: `Returning to ${returnMapNode?.['dcterms:title'] || fromSlug}...`,
            lockedMessage: null
          });
        }
      }
    }

    return connections;
  }

  /**
   * 3. Traverses a player through a physical map transition (door, stairs, portal).
   * Validates key/lock gating, updates GameState, and returns landing coordinates.
   */
  traverse(campaign, currentGameState, transitionTarget, partyInventory = [], worldFlags = {}) {
    const currentScene = CRPGMapNavigator.normalizeSlug(
      currentGameState['robos:currentScene'] || currentGameState.currentScene
    );
    const connectedList = this.getConnectedMaps(campaign, currentScene);

    // Find the transition matching target (can be connectionId, fromObjectId, or destination map slug)
    const conn = connectedList.find(c =>
      c.connectionId === transitionTarget ||
      c.fromObjectId === transitionTarget ||
      c.toMap === CRPGMapNavigator.normalizeSlug(transitionTarget)
    );

    if (!conn) {
      return {
        success: false,
        reason: 'no_such_transition',
        message: `No transition found matching '${transitionTarget}' from map '${currentScene}'`
      };
    }

    // Check key requirement
    if (conn.requiredKey) {
      const hasKey = partyInventory.some(item => {
        if (typeof item === 'string') return item === conn.requiredKey;
        return item.slug === conn.requiredKey || item.id === conn.requiredKey;
      });

      if (!hasKey) {
        return {
          success: false,
          reason: 'locked_missing_key',
          requiredKey: conn.requiredKey,
          message: conn.lockedMessage || `The passage is locked. You need a '${conn.requiredKey}'.`
        };
      }
    }

    // Check flag requirement
    if (conn.requiredFlag) {
      if (!worldFlags[conn.requiredFlag]) {
        return {
          success: false,
          reason: 'locked_missing_flag',
          requiredFlag: conn.requiredFlag,
          message: conn.lockedMessage || `Access barred by story condition '${conn.requiredFlag}'.`
        };
      }
    }

    // Transition succeeds!
    const targetMapNode = this.getMap(conn.toMap);
    const updatedState = {
      ...currentGameState,
      'robos:currentScene': conn.toMap,
      currentScene: conn.toMap,
      'robos:partyPosition': [...conn.toSpawn],
      partyPosition: [...conn.toSpawn],
      'robos:facing': conn.toFacing,
      facing: conn.toFacing
    };

    return {
      success: true,
      fromScene: currentScene,
      currentScene: conn.toMap,
      targetMapTitle: targetMapNode?.['dcterms:title'] || conn.toMap,
      partyPosition: [...conn.toSpawn],
      facing: conn.toFacing,
      transitionType: conn.transitionType,
      message: conn.transitionMessage || `Arrived in ${targetMapNode?.['dcterms:title'] || conn.toMap}`,
      consumedKey: false,
      gameState: updatedState
    };
  }

  /**
   * 4. What if an action transports the PCs somewhere?
   * Transports the party as a result of an action, spell, story event, or cutscene.
   * Parses robos:transport, robos:stateDelta, and Infinity Engine BCS script actions.
   */
  executeActionTransport(campaign, currentGameState, gameEventOrStoryNode, worldFlags = {}) {
    if (!gameEventOrStoryNode) throw new Error('Event or Story Node is required');

    let targetMap = null;
    let targetSpawn = [10, 10];
    let targetFacing = 'south';
    let cutscene = null;
    let narration = null;
    const appliedFlags = {};

    // A. Check robos:transport / transport
    const transport = gameEventOrStoryNode['robos:transport'] || gameEventOrStoryNode.transport;
    if (transport) {
      targetMap = CRPGMapNavigator.normalizeSlug(transport.targetMap || transport.toMap);
      if (transport.targetSpawn) targetSpawn = [...transport.targetSpawn];
      if (transport.toSpawn) targetSpawn = [...transport.toSpawn];
      if (transport.facing || transport.targetFacing) targetFacing = transport.facing || transport.targetFacing;
      if (transport.cutscene) cutscene = transport.cutscene;
      if (transport.narration) narration = transport.narration;
    }

    // B. Check stateDelta
    const delta = gameEventOrStoryNode['robos:stateDelta'] || gameEventOrStoryNode.stateDelta;
    if (delta) {
      if (delta['robos:currentScene'] || delta.currentScene) {
        targetMap = CRPGMapNavigator.normalizeSlug(delta['robos:currentScene'] || delta.currentScene);
      }
      if (delta['robos:partyPosition'] || delta.partyPosition) {
        targetSpawn = [...(delta['robos:partyPosition'] || delta.partyPosition)];
      }
      if (delta['robos:facing'] || delta.facing) {
        targetFacing = delta['robos:facing'] || delta.facing;
      }
      // Copy story flags
      for (const [k, v] of Object.entries(delta)) {
        if (!k.startsWith('robos:') && k !== 'currentScene' && k !== 'partyPosition' && k !== 'facing') {
          appliedFlags[k] = v;
        }
      }
    }

    // C. Check Infinity Engine BCS script actions (e.g. LeaveAreaLUA, TeleportParty)
    const infinity = gameEventOrStoryNode['robos:infinityInteraction'] || gameEventOrStoryNode.infinityInteraction;
    if (infinity && Array.isArray(infinity['robos:bcsAction'])) {
      for (const act of infinity['robos:bcsAction']) {
        const leaveMatch = act.match(/LeaveAreaLUA(?:Type)?\s*\(\s*["']([^"']+)["']\s*,\s*[^,]*\s*,\s*\[(\d+)\s*,\s*(\d+)\]\s*,\s*(\d+)\s*\)/i);
        if (leaveMatch) {
          targetMap = CRPGMapNavigator.normalizeSlug(leaveMatch[1]);
          targetSpawn = [parseInt(leaveMatch[2], 10), parseInt(leaveMatch[3], 10)];
          const dirCode = parseInt(leaveMatch[4], 10);
          const dirMap = ['south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast'];
          targetFacing = dirMap[dirCode] || 'south';
        }
        const teleportMatch = act.match(/TeleportParty\s*\(\s*\[(\d+)\s*,\s*(\d+)\]\s*\)/i);
        if (teleportMatch) {
          targetSpawn = [parseInt(teleportMatch[1], 10), parseInt(teleportMatch[2], 10)];
        }
        const cutMatch = act.match(/StartCutScene\s*\(\s*["']([^"']+)["']\s*\)/i);
        if (cutMatch) {
          cutscene = cutMatch[1];
        }
      }
    }

    // D. Check Story Node location if moving along narrative tree
    if (!targetMap && gameEventOrStoryNode['robos:location']) {
      targetMap = CRPGMapNavigator.normalizeSlug(gameEventOrStoryNode['robos:location']);
    }

    if (!targetMap) {
      return {
        success: false,
        reason: 'no_transport_destination',
        message: 'Action or event does not declare a transport destination'
      };
    }

    const targetMapNode = this.getMap(targetMap);
    const updatedState = {
      ...currentGameState,
      'robos:currentScene': targetMap,
      currentScene: targetMap,
      'robos:partyPosition': [...targetSpawn],
      partyPosition: [...targetSpawn],
      'robos:facing': targetFacing,
      facing: targetFacing,
      'robos:worldFlags': {
        ...(currentGameState['robos:worldFlags'] || currentGameState.worldFlags || {}),
        ...worldFlags,
        ...appliedFlags
      }
    };

    return {
      success: true,
      currentScene: targetMap,
      targetMapTitle: targetMapNode?.['dcterms:title'] || targetMap,
      partyPosition: [...targetSpawn],
      facing: targetFacing,
      cutscene,
      narration: narration || `Action transported party to ${targetMapNode?.['dcterms:title'] || targetMap}`,
      appliedFlags,
      gameState: updatedState,
      message: `Party transported to ${targetMapNode?.['dcterms:title'] || targetMap} at [${targetSpawn.join(', ')}]`
    };
  }

  /**
   * 5. Validates the entire campaign map graph topology in a contract-first manner.
   * Checks bounds, blocked collisions, dead ends, reachability, and SHACL compliance.
   */
  validateTopology(campaign) {
    const report = {
      valid: true,
      errors: [],
      warnings: [],
      mapCount: 0,
      connectionCount: 0,
      reachableMaps: []
    };

    if (!campaign) {
      report.valid = false;
      report.errors.push('Campaign is null or undefined');
      return report;
    }

    // A. Check starting map
    let startingMap;
    try {
      startingMap = this.getStartingMap(campaign);
      report.reachableMaps.push(startingMap.mapSlug);
    } catch (err) {
      report.valid = false;
      report.errors.push(`Starting map error: ${err.message}`);
      return report;
    }

    const startNode = startingMap.mapNode;
    if (!startNode) {
      report.valid = false;
      report.errors.push(`Starting map '${startingMap.mapSlug}' not found in loaded maps registry`);
    } else {
      // Check starting spawn bounds
      const [sx, sy] = startingMap.spawn;
      if (sx < 0 || sx > startingMap.width || sy < 0 || sy > startingMap.height) {
        report.valid = false;
        report.errors.push(
          `Starting spawn [${sx}, ${sy}] is out of bounds for map '${startingMap.mapSlug}' (${startingMap.width}x${startingMap.height})`
        );
      }
      // Check collision
      if (startNode['robos:blockout']?.blocked) {
        const gSize = startNode['robos:blockout'].gridSize || 5;
        const col = Math.floor(sx / gSize);
        const row = Math.floor(sy / gSize);
        const isBlocked = startNode['robos:blockout'].blocked.some(([c, r]) => c === col && r === row);
        if (isBlocked) {
          report.warnings.push(
            `Starting spawn [${sx}, ${sy}] lands on blocked collision grid cell [${col}, ${row}]`
          );
        }
      }
    }

    // B. Check declared campaign maps
    const declaredMaps = (campaign['robos:maps'] || campaign.maps || [])
      .map(m => CRPGMapNavigator.normalizeSlug(m));
    report.mapCount = declaredMaps.length;

    for (const slug of declaredMaps) {
      const node = this.getMap(slug);
      if (!node) {
        report.warnings.push(`Campaign references map '${slug}' which is not in the maps repository`);
      }
    }

    // C. Evaluate all connections and traverse the map graph
    const queue = [startingMap.mapSlug];
    const visited = new Set([startingMap.mapSlug]);
    let totalConns = 0;

    while (queue.length > 0) {
      const curr = queue.shift();
      const conns = this.getConnectedMaps(campaign, curr);
      totalConns += conns.length;

      for (const c of conns) {
        const dest = c.toMap;
        const destNode = this.getMap(dest);

        if (!destNode) {
          report.errors.push(
            `Map connection from '${curr}' (${c.fromObjectId}) targets missing map '${dest}'`
          );
        } else {
          // Check destination spawn bounds
          const [dx, dy] = c.toSpawn;
          const w = destNode['robos:width'] || 60;
          const h = destNode['robos:height'] || 40;
          if (dx < 0 || dx > w || dy < 0 || dy > h) {
            report.errors.push(
              `Connection from '${curr}' to '${dest}' targets out-of-bounds spawn [${dx}, ${dy}] (map size ${w}x${h})`
            );
          }

          // Check if spawn lands in blocked cell
          if (destNode['robos:blockout']?.blocked) {
            const gSize = destNode['robos:blockout'].gridSize || 5;
            const cCol = Math.floor(dx / gSize);
            const cRow = Math.floor(dy / gSize);
            const isBlocked = destNode['robos:blockout'].blocked.some(([col, row]) => col === cCol && row === cRow);
            if (isBlocked) {
              report.warnings.push(
                `Connection from '${curr}' to '${dest}' lands on blocked collision cell [${cCol}, ${cRow}]`
              );
            }
          }
        }

        if (!visited.has(dest)) {
          visited.add(dest);
          queue.push(dest);
        }
      }
    }

    report.connectionCount = totalConns;
    report.reachableMaps = Array.from(visited);

    // D. Story Flow location check
    const storyFlow = campaign['robos:storyFlow'] || campaign.storyFlow;
    const knownScenes = new Set(campaign['robos:scenes'] || campaign.scenes || []);
    if (storyFlow && Array.isArray(storyFlow['robos:storyNodes'])) {
      for (const node of storyFlow['robos:storyNodes']) {
        const loc = CRPGMapNavigator.normalizeSlug(node['robos:location'] || node.location);
        if (loc) {
          const mapNode = this.getMap(loc);
          if (!mapNode && !knownScenes.has(loc)) {
            report.errors.push(`Story node '${node.id}' references unknown map location '${loc}'`);
          }
        }
      }
    }

    report.valid = report.errors.length === 0;
    return report;
  }
}

module.exports = {
  CRPGMapNavigator
};
