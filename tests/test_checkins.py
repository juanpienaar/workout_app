"""Run with: python -m unittest discover -s tests -p test_checkins.py -v"""
import tempfile
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routes import checkin_routes as c
from app import data
from app.auth import get_current_user

class CheckinTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.old_dir=data.config.DATA_DIR;self.old_backup=data._BACKUP_DIR
  data.config.DATA_DIR=Path(self.tmp.name);data._BACKUP_DIR=Path(self.tmp.name)/'_backups'
  self.original=c.load_users;c.load_users=lambda:{'athlete':{},'other':{},'coach':{}}
  self.user={'name':'athlete','role':'athlete'}
  app=FastAPI();app.include_router(c.router);app.dependency_overrides[get_current_user]=lambda:self.user
  self.client=TestClient(app);self.base='/api/coaching/athletes/athlete/checkins'
 def tearDown(self):
  data.config.DATA_DIR=self.old_dir;data._BACKUP_DIR=self.old_backup;c.load_users=self.original;self.tmp.cleanup()
 def test_roundtrip_preserves_other_data(self):
  data.save_user_data('athlete',{'workout_logs':{'session':'saved'},'messages':[{'text':'keep me'}]})
  r=self.client.post(self.base,json={'date':'2026-10-20','energy':4,'sleep_hours':8,'notes':'Good'});self.assertEqual(r.status_code,200);cid=r.json()['id']
  self.user={'name':'coach','role':'coach'}
  self.assertEqual(self.client.patch(self.base+'/'+cid,json={'feedback':'Keep going'}).status_code,200)
  d=self.client.get(self.base).json();self.assertEqual(d['checkins'][0]['status'],'reviewed')
  d=data.load_user_data('athlete');self.assertEqual(d['messages'][0]['text'],'keep me');self.assertEqual(d['workout_logs']['session'],'saved')
 def test_other_athlete_forbidden(self):
  self.user={'name':'other','role':'athlete'}
  self.assertEqual(self.client.get(self.base).status_code,403)
  self.assertEqual(self.client.post(self.base,json={'date':'2026-10-20','energy':4,'sleep_hours':8}).status_code,403)
 def test_only_coach_can_review(self):
  self.assertEqual(self.client.patch(self.base+'/unknown',json={'feedback':'x'}).status_code,403)
 def test_invalid_and_missing(self):
  self.assertEqual(self.client.post(self.base,json={'date':'2026-10-20','energy':6,'sleep_hours':8}).status_code,422)
  self.user={'name':'coach','role':'coach'}
  self.assertEqual(self.client.get('/api/coaching/athletes/missing/checkins').status_code,404)
  self.assertEqual(self.client.patch(self.base+'/missing',json={'feedback':'x'}).status_code,404)
  self.assertEqual(self.client.patch(self.base+'/missing',json={'feedback':'   '}).status_code,422)
 def test_anonymous_forbidden(self):
  app=FastAPI();app.include_router(c.router)
  self.assertEqual(TestClient(app).get(self.base).status_code,401)
 def test_concurrent_submissions(self):
  from concurrent.futures import ThreadPoolExecutor
  def submit(i):return self.client.post(self.base,json={'date':'2026-10-20','energy':4,'sleep_hours':8,'notes':str(i)}).status_code
  with ThreadPoolExecutor(max_workers=5) as pool:self.assertEqual(list(pool.map(submit,range(12))),[200]*12)
  self.assertEqual(len(self.client.get(self.base).json()['checkins']),12)

if __name__=='__main__':unittest.main()
