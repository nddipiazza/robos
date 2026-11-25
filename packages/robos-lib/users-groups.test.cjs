'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ug = require('./users-groups');
const { SkillsExecutor } = require('../voice-prompt/lib/skills-executor');
const { VoiceCommandsRegistry } = require('../voice-prompt/lib/voice-commands-registry');

function makeTempConfig() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-ug-test-'));
  const configDir = path.join(homeDir, '.config', 'robos');
  fs.mkdirSync(path.join(configDir, 'groups'), { recursive: true });
  // Seed default profiles (Nicholas & Diana) + sample family/kids groups
  ug.listUsers({ configDir, seedDefaults: true });
  fs.writeFileSync(
    path.join(configDir, 'groups', 'family.json'),
    JSON.stringify({
      id: 'family',
      name: 'DiPiazza & Arrington Family',
      description: 'Household & Family group.',
      members: ['nicholas-dipiazza', 'diana-arrington'],
      contexts: [],
      settings: {},
      workspaces: [],
    }, null, 2)
  );
  return { homeDir, configDir, cleanup: () => fs.rmSync(homeDir, { recursive: true, force: true }) };
}

test('users CRUD, nickname lookup, active user switch, and rich Q&A', () => {
  const env = makeTempConfig();
  try {
    const users = ug.listUsers({ configDir: env.configDir });
    assert.ok(users.length >= 2);

    const nick = ug.resolveUser('Nick', { configDir: env.configDir });
    assert.equal(nick.uid, 'nicholas-dipiazza');

    const diana = ug.resolveUser('Diana', { configDir: env.configDir });
    assert.equal(diana.uid, 'diana-arrington');

    // Active user switch
    assert.equal(ug.getActiveUser({ configDir: env.configDir }).activeUserUid, 'nicholas-dipiazza');
    const switched = ug.setActiveUser('Diana', { configDir: env.configDir });
    assert.equal(switched.ok, true);
    assert.equal(ug.getActiveUser({ configDir: env.configDir }).activeUserUid, 'diana-arrington');

    // Rich Q&A facts
    const rpg = ug.answerUserQuestion('Diana', 'rpg', { configDir: env.configDir });
    assert.match(rpg.spoken, /Oath of the Ancients Paladin/i);

    const musicDis = ug.answerUserQuestion('Diana', 'music-dislikes', { configDir: env.configDir });
    assert.match(musicDis.spoken, /female vocals/i);

    const gt = ug.answerUserQuestion('Nick', 'gamerTag', { configDir: env.configDir });
    assert.match(gt.spoken, /IllusionistNick/);

    // Add, update, remove user
    const created = ug.createUser({
      displayName: 'Bella DiPiazza',
      nickname: 'Bella',
      email: 'bella@example.com',
      groups: ['Family', 'Game Night'],
    }, { configDir: env.configDir });
    assert.equal(created.ok, true);
    assert.equal(created.user.uid, 'bella-dipiazza');

    // Group file `family.json` automatically received `bella-dipiazza`
    const fam = ug.resolveGroup('family', { configDir: env.configDir });
    assert.ok(fam.members.includes('bella-dipiazza'));

    const updated = ug.updateUser('Bella', { gamerTag: 'BellaD', birthday: '2014-05-10' }, { configDir: env.configDir });
    assert.equal(updated.ok, true);
    assert.equal(ug.answerUserQuestion('Bella', 'birthday', { configDir: env.configDir }).value, '2014-05-10');

    const deleted = ug.deleteUser('Bella', { configDir: env.configDir });
    assert.equal(deleted.ok, true);
    assert.equal(ug.resolveUser('Bella', { configDir: env.configDir }), null);
    assert.ok(!ug.resolveGroup('family', { configDir: env.configDir }).members.includes('bella-dipiazza'));
  } finally {
    env.cleanup();
  }
});

test('groups CRUD, two-way membership sync, KGraph, and RobOS Services state payload', () => {
  const env = makeTempConfig();
  try {
    const cg = ug.createGroup({
      name: 'Band Practice',
      description: 'Rock Invasion rehearsal',
      members: 'Nick, Diana',
    }, { configDir: env.configDir });
    assert.equal(cg.ok, true);
    assert.equal(cg.group.id, 'band-practice');
    assert.deepEqual(cg.group.members.sort(), ['diana-arrington', 'nicholas-dipiazza']);

    // Verify Diana's profile groups tag also received "Band Practice"
    assert.ok(ug.resolveUser('Diana', { configDir: env.configDir }).groups.includes('Band Practice'));

    // Remove Diana from Band Practice -> updates both group file and Diana's profile
    const rm = ug.removeMemberFromGroup('Diana', 'Band Practice', { configDir: env.configDir });
    assert.equal(rm.ok, true);
    assert.deepEqual(ug.resolveGroup('Band Practice', { configDir: env.configDir }).members, ['nicholas-dipiazza']);
    assert.ok(!ug.resolveUser('Diana', { configDir: env.configDir }).groups.includes('Band Practice'));

    // KGraph & Services sync
    const kg = ug.syncUsersGroupsKGraph({ configDir: env.configDir });
    assert.equal(kg.ok, true);
    assert.ok(fs.existsSync(kg.kgraphFile));

    const svc = ug.syncLocalRobosServicesData({ configDir: env.configDir });
    assert.equal(svc.ok, true);
    const svcJson = JSON.parse(fs.readFileSync(svc.dataFile, 'utf8'));
    assert.ok(Array.isArray(svcJson.users) && svcJson.users.length >= 2);
    assert.ok(Array.isArray(svcJson.groups) && svcJson.groups.some((g) => g.id === 'band-practice'));
  } finally {
    env.cleanup();
  }
});

test('Voice Assistant commands via VoiceCommandsRegistry and SkillsExecutor', async () => {
  const env = makeTempConfig();
  const prevHome = process.env.HOME;
  process.env.HOME = env.homeDir;
  try {
    const registry = new VoiceCommandsRegistry();
    assert.equal(registry.matchCommand('Commander, who are the robos users').command?.targetId, 'robos-users');
    assert.equal(registry.matchCommand('who is in the family group').command?.targetId, 'robos-groups');

    const executor = new SkillsExecutor();

    const r1 = await executor.executeCommand('who are the robos users');
    assert.equal(r1.ok, true);
    assert.equal(r1.skill, 'robos-users');
    assert.match(r1.response, /Nicholas DiPiazza/);

    const r2 = await executor.executeCommand('what robos groups do we have');
    assert.equal(r2.ok, true);
    assert.equal(r2.skill, 'robos-groups');
    assert.match(r2.response, /DiPiazza & Arrington Family/);

    const r3 = await executor.executeCommand('who is in the Family group');
    assert.equal(r3.ok, true);
    assert.equal(r3.skill, 'robos-groups');
    assert.match(r3.response, /Diana Arrington/);

    const r4 = await executor.executeCommand("what is Diana's Baldur's Gate 3 character");
    assert.equal(r4.ok, true);
    assert.equal(r4.skill, 'robos-users');
    assert.match(r4.response, /Oath of the Ancients Paladin/);

    const r5 = await executor.executeCommand('switch robos user to Diana');
    assert.equal(r5.ok, true);
    assert.match(r5.response, /Diana Arrington/);

    const r6 = await executor.executeCommand('who am I');
    assert.equal(r6.ok, true);
    assert.match(r6.response, /Diana Arrington/);

    // Ensure calendar & app-open commands are never hijacked
    assert.equal(ug.isUsersOrGroupsVoiceCommand('open robos users', { configDir: env.configDir }), false);
    assert.equal(ug.isUsersOrGroupsVoiceCommand('open group manager', { configDir: env.configDir }), false);
    assert.equal(ug.isUsersOrGroupsVoiceCommand('add dentist appointment on Friday at 3pm to family calendar', { configDir: env.configDir }), false);
  } finally {
    process.env.HOME = prevHome;
    env.cleanup();
  }
});
