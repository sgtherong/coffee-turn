import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, buyerFor, displayName, purchaseTransition, undoTransition } from '../rotation.js';
test('3인 모드 순환',()=>{
 let s=initialState(), buyers=[];
 for(let i=0;i<5;i++){const {next,event}=purchaseTransition(s,'ABC',String(i),'tester',new Date()); buyers.push(event.buyer);s=next;}
 assert.deepEqual(buyers,['A','C','B','A','C']);
});
test('2인 모드 독립',()=>{
 let s=initialState();s=purchaseTransition(s,'ABC','a1','tester',new Date()).next;
 assert.equal(buyerFor(s,'ABC'),'C');assert.equal(buyerFor(s,'AB'),'A');
 s=purchaseTransition(s,'AB','b1','tester',new Date()).next;
 assert.equal(buyerFor(s,'AB'),'B');assert.equal(buyerFor(s,'ABC'),'C');
});
test('모드 전환 뒤 구매 취소',()=>{
 let s=initialState(), evt;
 s=purchaseTransition(s,'ABC','a1','tester',new Date()).next;
 ({next:s,event:evt}=purchaseTransition(s,'AB','b1','tester',new Date()));
 s=undoTransition(s,evt);
 assert.equal(s.lastEventId,'a1');assert.equal(buyerFor(s,'ABC'),'C');assert.equal(buyerFor(s,'AB'),'A');
});
test('이전 이벤트를 취소하려 하면 오류',()=>{
 let s=initialState(),e;
 ({next:s,event:e}=purchaseTransition(s,'ABC','x1','tester',new Date()));
 s=purchaseTransition(s,'ABC','x2','tester',new Date()).next;
 assert.throws(()=>undoTransition(s,e));
});
test('기존 식별자는 유지하면서 참가자 이름은 한글로 표시',()=>{
 assert.deepEqual(['A','B','C'].map(displayName),['토니','코비','영']);
 assert.equal(displayName(purchaseTransition(initialState(),'ABC','n','tester',new Date()).event.buyer),'토니');
});
