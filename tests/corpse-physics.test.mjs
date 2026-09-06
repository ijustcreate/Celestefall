import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepBatCorpse } from '../server/corpse-physics.mjs';
import { createSimulation } from '../server/simulation.mjs';
const bat = (extra = {}) => ({ type:'bat', alive:false, width:32, x:100, y:50, vx:0, vy:0, respawnTimer:120, ...extra });
test('falls onto nearest top even at tunneling speed and unordered surfaces', () => {
  const c = bat({vy:400});
  stepBatCorpse(c, [{x:0,y:336,w:1920}, {x:70,y:100,w:60}, {x:70,y:200,w:60}]);
  assert.equal(c.y,100); assert.equal(c.grounded,true); assert.equal(c.vy,0);
  assert.equal(c.respawnTimer,120);
});
test('horizontal sweep checks overlap at crossing, not end of step', () => {
  const c = bat({vx:200,vy:100});
  stepBatCorpse(c,[{x:180,y:100,w:35}]);
  assert.equal(c.grounded,true); assert.equal(c.y,100);
});
test('missed platforms fall to floor; upward knockback is preserved', () => {
  const c = bat({vy:-3});
  const surfaces = [{x:300,y:100,w:50},{x:0,y:336,w:1920}];
  stepBatCorpse(c,surfaces); assert.ok(c.y < 50);
  for(let i=0;i<150;i++) stepBatCorpse(c,surfaces);
  assert.equal(c.y,336); assert.equal(c.grounded,true);
});
test('settled corpse follows moving support and resumes falling if removed', () => {
  const c = bat({vy:70}); const surface = {id:'lift',x:50,y:100,w:100};
  stepBatCorpse(c,[surface]); surface.x+=10; surface.y-=5;
  stepBatCorpse(c,[surface]); assert.equal(c.x,110); assert.equal(c.y,95);
  stepBatCorpse(c,[]); assert.equal(c.grounded,false); assert.ok(c.y>95);
});
test('living bats and other actors are untouched', () => {
  for(const c of [bat({alive:true}),bat({type:'slug'}),bat({type:'player'})]) {
    const before = {...c}; stepBatCorpse(c,[]); assert.deepEqual(c,before);
  }
});
test('server owns falling position, grounded snapshot and delayed respawn lifetime', () => {
  const sim = createSimulation({random:()=>.5});
  sim.addPlayer({id:'observer',name:'Observer',color:'#ff0000'});
  const c = sim.game.creatures.find(c=>c.id==='bat-west');
  Object.assign(c,{alive:false,health:0,animation:'death',respawnTimer:120,vx:0,vy:0});
  for(let i=0;i<10;i++) sim.step();
  assert.ok(c.y>210); assert.equal(c.respawnTimer,120);
  for(let i=0;i<25;i++) sim.step();
  const published = sim.snapshot().creatures.find(c=>c.id==='bat-west');
  assert.equal(published.y,292); assert.equal(published.grounded,true);
  assert.equal(published.animation,'death'); assert.equal(published.alive,false);
  for(let i=0;i<112;i++) sim.step();
  assert.equal(c.alive,true); assert.equal(c.grounded,false);
});
