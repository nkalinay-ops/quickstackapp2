-- Replace initial stub data with a richer sample set.
-- 25 entries across 4 release Wednesdays in September 2026.
-- Lunar entries: DC/Marvel/Image/IDW single-issue softcovers.
-- PRH entries: Image/BOOM!/VIZ single issues and trades with real ISBNs
--   so cover images resolve from images.penguinrandomhouse.com.

DELETE FROM pull_list_items;

INSERT INTO pull_list_items
  (source, sku, title, publisher, format, variant_label, price,
   foc_date, on_sale_date, writer, artist, upc_isbn, cover_image_url, raw, last_seen_at)
VALUES

-- ── Sep 3, 2026 ─────────────────────────────────────────────────────────────

('lunar','0826DC8801','BATMAN #175','DC Comics','SOFTCOVER',NULL,4.99,
 '2026-08-10','2026-09-03','Joshua Williamson','Jorge Jimenez',
 '76194136279217511',
 'https://media.lunardistribution.com/images/covers/0826DC8801.jpg',
 '{"ProductCode":"0826DC8801","Title":"BATMAN #175","RetailCost":4.99,"Publisher":"DC Comics","InstoreDate":"09/03/2026","FinalOrderCutoff":"08/10/2026","Writer":"Joshua Williamson","Artist":"Jorge Jimenez","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826DC8802','NIGHTWING #122','DC Comics','SOFTCOVER',NULL,3.99,
 '2026-08-10','2026-09-03','Tom Taylor','Bruno Redondo',
 '76194136279112211',
 'https://media.lunardistribution.com/images/covers/0826DC8802.jpg',
 '{"ProductCode":"0826DC8802","Title":"NIGHTWING #122","RetailCost":3.99,"Publisher":"DC Comics","InstoreDate":"09/03/2026","FinalOrderCutoff":"08/10/2026","Writer":"Tom Taylor","Artist":"Bruno Redondo","Mature":false,"NumberOfPages":24,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826MA1101','DAREDEVIL #18','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-10','2026-09-03','Saladin Ahmed','Aaron Kuder',
 '75960609124101811',
 'https://media.lunardistribution.com/images/covers/0826MA1101.jpg',
 '{"ProductCode":"0826MA1101","Title":"DAREDEVIL #18","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/03/2026","FinalOrderCutoff":"08/10/2026","Writer":"Saladin Ahmed","Artist":"Aaron Kuder","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826IM5501','HYDE STREET #9','Image Comics','SOFTCOVER',NULL,3.99,
 '2026-08-10','2026-09-03','Geoff Johns','Ivan Reis',
 '70985603450300911',
 'https://media.lunardistribution.com/images/covers/0826IM5501.jpg',
 '{"ProductCode":"0826IM5501","Title":"HYDE STREET #9","RetailCost":3.99,"Publisher":"Image Comics","InstoreDate":"09/03/2026","FinalOrderCutoff":"08/10/2026","Writer":"Geoff Johns","Artist":"Ivan Reis","Mature":false,"NumberOfPages":24,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('prh','9781534339835','SAGA #70','Image Comics','Comic Book',NULL,3.99,
 '2026-08-10','2026-09-03','Brian K. Vaughan','Fiona Staples',
 '9781534339835',
 'https://images.penguinrandomhouse.com/cover/9781534339835?width=500',
 '{"title":"SAGA #70","authors":["Brian K. Vaughan","Fiona Staples"],"isbn":"9781534339835","price_usa":"$3.99 US","on_sale_raw":"On sale Sep 03, 2026","foc_raw":"FOC Aug 10, 2026","format":"Comic Book","publisher":"Image Comics","variant_label":null}'::jsonb,
 now()),

('prh','9781684158850','SOMETHING IS KILLING THE CHILDREN #42','BOOM! Studios','Comic Book',NULL,3.99,
 '2026-08-10','2026-09-03','James Tynion IV','Werther Dell''Edera',
 '9781684158850',
 'https://images.penguinrandomhouse.com/cover/9781684158850?width=500',
 '{"title":"SOMETHING IS KILLING THE CHILDREN #42","authors":["James Tynion IV","Werther Dell''Edera"],"isbn":"9781684158850","price_usa":"$3.99 US","on_sale_raw":"On sale Sep 03, 2026","foc_raw":"FOC Aug 10, 2026","format":"Comic Book","publisher":"BOOM! Studios","variant_label":null}'::jsonb,
 now()),

-- ── Sep 10, 2026 ────────────────────────────────────────────────────────────

('lunar','0826MA1201','X-MEN #18','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-17','2026-09-10','Jed MacKay','Francesco Mobili',
 '75960609783701811',
 'https://media.lunardistribution.com/images/covers/0826MA1201.jpg',
 '{"ProductCode":"0826MA1201","Title":"X-MEN #18","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/10/2026","FinalOrderCutoff":"08/17/2026","Writer":"Jed MacKay","Artist":"Francesco Mobili","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826DC9301','SUPERMAN #24','DC Comics','SOFTCOVER',NULL,4.99,
 '2026-08-17','2026-09-10','Joshua Williamson','Jamal Campbell',
 '76194136279202411',
 'https://media.lunardistribution.com/images/covers/0826DC9301.jpg',
 '{"ProductCode":"0826DC9301","Title":"SUPERMAN #24","RetailCost":4.99,"Publisher":"DC Comics","InstoreDate":"09/10/2026","FinalOrderCutoff":"08/17/2026","Writer":"Joshua Williamson","Artist":"Jamal Campbell","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826MA1202','MILES MORALES: SPIDER-MAN #32','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-17','2026-09-10','Cody Ziglar','Federico Vicentini',
 '75960609784603211',
 'https://media.lunardistribution.com/images/covers/0826MA1202.jpg',
 '{"ProductCode":"0826MA1202","Title":"MILES MORALES: SPIDER-MAN #32","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/10/2026","FinalOrderCutoff":"08/17/2026","Writer":"Cody Ziglar","Artist":"Federico Vicentini","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826MA1203','THE IMMORTAL THOR #22','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-17','2026-09-10','Al Ewing','Martin Coccolo',
 '75960609784802211',
 'https://media.lunardistribution.com/images/covers/0826MA1203.jpg',
 '{"ProductCode":"0826MA1203","Title":"THE IMMORTAL THOR #22","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/10/2026","FinalOrderCutoff":"08/17/2026","Writer":"Al Ewing","Artist":"Martin Coccolo","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('prh','9798891609433','ONE PIECE VOL. 109','VIZ Media','Paperback',NULL,11.99,
 '2026-08-17','2026-09-10','Eiichiro Oda',NULL,
 '9798891609433',
 'https://images.penguinrandomhouse.com/cover/9798891609433?width=500',
 '{"title":"ONE PIECE VOL. 109","authors":["Eiichiro Oda"],"isbn":"9798891609433","price_usa":"$11.99 US","on_sale_raw":"On sale Sep 10, 2026","foc_raw":"FOC Aug 17, 2026","format":"Paperback","publisher":"VIZ Media","variant_label":null}'::jsonb,
 now()),

('prh','9780593835401','CHAINSAW MAN VOL. 18','VIZ Media','Paperback',NULL,11.99,
 '2026-08-17','2026-09-10','Tatsuki Fujimoto',NULL,
 '9780593835401',
 'https://images.penguinrandomhouse.com/cover/9780593835401?width=500',
 '{"title":"CHAINSAW MAN VOL. 18","authors":["Tatsuki Fujimoto"],"isbn":"9780593835401","price_usa":"$11.99 US","on_sale_raw":"On sale Sep 10, 2026","foc_raw":"FOC Aug 17, 2026","format":"Paperback","publisher":"VIZ Media","variant_label":null}'::jsonb,
 now()),

-- ── Sep 17, 2026 ────────────────────────────────────────────────────────────

('lunar','0826MA1301','AMAZING SPIDER-MAN #268','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-24','2026-09-17','Zeb Wells','John Romita Jr.',
 '75960620789726811',
 'https://media.lunardistribution.com/images/covers/0826MA1301.jpg',
 '{"ProductCode":"0826MA1301","Title":"AMAZING SPIDER-MAN #268","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/17/2026","FinalOrderCutoff":"08/24/2026","Writer":"Zeb Wells","Artist":"John Romita Jr.","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826DC9201','ABSOLUTE BATMAN #9','DC Comics','SOFTCOVER',NULL,4.99,
 '2026-08-24','2026-09-17','Scott Snyder','Nick Dragotta',
 '76194138584600998',
 'https://media.lunardistribution.com/images/covers/0826DC9201.jpg',
 '{"ProductCode":"0826DC9201","Title":"ABSOLUTE BATMAN #9","RetailCost":4.99,"Publisher":"DC Comics","InstoreDate":"09/17/2026","FinalOrderCutoff":"08/24/2026","Writer":"Scott Snyder","Artist":"Nick Dragotta","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826DC9202','ABSOLUTE BATMAN #9 Card Stock Variant','DC Comics','SOFTCOVER','Card Stock Variant',5.99,
 '2026-08-24','2026-09-17','Scott Snyder','Nick Dragotta',
 '76194138584600999',
 'https://media.lunardistribution.com/images/covers/0826DC9202.jpg',
 '{"ProductCode":"0826DC9202","Title":"ABSOLUTE BATMAN #9 Card Stock Variant","RetailCost":5.99,"Publisher":"DC Comics","InstoreDate":"09/17/2026","FinalOrderCutoff":"08/24/2026","Writer":"Scott Snyder","Artist":"Nick Dragotta","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826DC9203','FLASH #24','DC Comics','SOFTCOVER',NULL,3.99,
 '2026-08-24','2026-09-17','Simon Spurrier','Mike Deodato Jr.',
 '76194136279101711',
 'https://media.lunardistribution.com/images/covers/0826DC9203.jpg',
 '{"ProductCode":"0826DC9203","Title":"FLASH #24","RetailCost":3.99,"Publisher":"DC Comics","InstoreDate":"09/17/2026","FinalOrderCutoff":"08/24/2026","Writer":"Simon Spurrier","Artist":"Mike Deodato Jr.","Mature":false,"NumberOfPages":24,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826IDW7701','TEENAGE MUTANT NINJA TURTLES #154','IDW Publishing','SOFTCOVER',NULL,4.99,
 '2026-08-24','2026-09-17','Jason Aaron','Joëlle Jones',
 '82771401234515411',
 'https://media.lunardistribution.com/images/covers/0826IDW7701.jpg',
 '{"ProductCode":"0826IDW7701","Title":"TEENAGE MUTANT NINJA TURTLES #154","RetailCost":4.99,"Publisher":"IDW Publishing","InstoreDate":"09/17/2026","FinalOrderCutoff":"08/24/2026","Writer":"Jason Aaron","Artist":"Joëlle Jones","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('prh','9781974746132','JUJUTSU KAISEN VOL. 27','VIZ Media','Paperback',NULL,11.99,
 '2026-08-24','2026-09-17','Gege Akutami',NULL,
 '9781974746132',
 'https://images.penguinrandomhouse.com/cover/9781974746132?width=500',
 '{"title":"JUJUTSU KAISEN VOL. 27","authors":["Gege Akutami"],"isbn":"9781974746132","price_usa":"$11.99 US","on_sale_raw":"On sale Sep 17, 2026","foc_raw":"FOC Aug 24, 2026","format":"Paperback","publisher":"VIZ Media","variant_label":null}'::jsonb,
 now()),

('prh','9781632295987','SAGA VOL. 12','Image Comics','Paperback',NULL,17.99,
 '2026-08-24','2026-09-17','Brian K. Vaughan','Fiona Staples',
 '9781632295987',
 'https://images.penguinrandomhouse.com/cover/9781632295987?width=500',
 '{"title":"SAGA VOL. 12","authors":["Brian K. Vaughan","Fiona Staples"],"isbn":"9781632295987","price_usa":"$17.99 US","on_sale_raw":"On sale Sep 17, 2026","foc_raw":"FOC Aug 24, 2026","format":"Paperback","publisher":"Image Comics","variant_label":null}'::jsonb,
 now()),

-- ── Sep 24, 2026 ────────────────────────────────────────────────────────────

('lunar','0826MA1401','CAPTAIN AMERICA #10','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-31','2026-09-24','J. Michael Straczynski','Jesus Saiz',
 '75960620789901011',
 'https://media.lunardistribution.com/images/covers/0826MA1401.jpg',
 '{"ProductCode":"0826MA1401","Title":"CAPTAIN AMERICA #10","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/24/2026","FinalOrderCutoff":"08/31/2026","Writer":"J. Michael Straczynski","Artist":"Jesus Saiz","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826MA1402','WOLVERINE #8','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-31','2026-09-24','Saladin Ahmed','Martin Coccolo',
 '75960620789800811',
 'https://media.lunardistribution.com/images/covers/0826MA1402.jpg',
 '{"ProductCode":"0826MA1402","Title":"WOLVERINE #8","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/24/2026","FinalOrderCutoff":"08/31/2026","Writer":"Saladin Ahmed","Artist":"Martin Coccolo","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826DC9401','GREEN LANTERN #22','DC Comics','SOFTCOVER',NULL,3.99,
 '2026-08-31','2026-09-24','Jeremy Adams','Xermanico',
 '76194136279102211',
 'https://media.lunardistribution.com/images/covers/0826DC9401.jpg',
 '{"ProductCode":"0826DC9401","Title":"GREEN LANTERN #22","RetailCost":3.99,"Publisher":"DC Comics","InstoreDate":"09/24/2026","FinalOrderCutoff":"08/31/2026","Writer":"Jeremy Adams","Artist":"Xermanico","Mature":false,"NumberOfPages":24,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('lunar','0826MA1403','AVENGERS #22','Marvel Comics','SOFTCOVER',NULL,4.99,
 '2026-08-31','2026-09-24','Jason Aaron','Stuart Immonen',
 '75960609784302211',
 'https://media.lunardistribution.com/images/covers/0826MA1403.jpg',
 '{"ProductCode":"0826MA1403","Title":"AVENGERS #22","RetailCost":4.99,"Publisher":"Marvel Comics","InstoreDate":"09/24/2026","FinalOrderCutoff":"08/31/2026","Writer":"Jason Aaron","Artist":"Stuart Immonen","Mature":false,"NumberOfPages":32,"Color":"FC","CoverType":"SOFTCOVER","Rating":"T+"}'::jsonb,
 now()),

('prh','9798895614068','THE 100 GIRLFRIENDS WHO REALLY, REALLY, REALLY, REALLY, REALLY LOVE YOU VOL. 19','Ghost Ship','Paperback',NULL,13.99,
 '2026-08-31','2026-09-24','Rikito Nakamura','Yukiko Nozawa',
 '9798895614068',
 'https://images.penguinrandomhouse.com/cover/9798895614068?width=500',
 '{"title":"THE 100 GIRLFRIENDS WHO REALLY, REALLY, REALLY, REALLY, REALLY LOVE YOU VOL. 19","authors":["Rikito Nakamura","Yukiko Nozawa"],"isbn":"9798895614068","price_usa":"$13.99 US","on_sale_raw":"On sale Sep 24, 2026","foc_raw":"FOC Aug 31, 2026","format":"Paperback","publisher":"Ghost Ship","variant_label":null}'::jsonb,
 now()),

('prh','9781647223809','SOMETHING IS KILLING THE CHILDREN VOL. 9','BOOM! Studios','Paperback',NULL,16.99,
 '2026-08-31','2026-09-24','James Tynion IV','Werther Dell''Edera',
 '9781647223809',
 'https://images.penguinrandomhouse.com/cover/9781647223809?width=500',
 '{"title":"SOMETHING IS KILLING THE CHILDREN VOL. 9","authors":["James Tynion IV","Werther Dell''Edera"],"isbn":"9781647223809","price_usa":"$16.99 US","on_sale_raw":"On sale Sep 24, 2026","foc_raw":"FOC Aug 31, 2026","format":"Paperback","publisher":"BOOM! Studios","variant_label":null}'::jsonb,
 now())

ON CONFLICT (source, sku) DO UPDATE SET
  title             = EXCLUDED.title,
  publisher         = EXCLUDED.publisher,
  format            = EXCLUDED.format,
  variant_label     = EXCLUDED.variant_label,
  price             = EXCLUDED.price,
  foc_date          = EXCLUDED.foc_date,
  on_sale_date      = EXCLUDED.on_sale_date,
  writer            = EXCLUDED.writer,
  artist            = EXCLUDED.artist,
  upc_isbn          = EXCLUDED.upc_isbn,
  cover_image_url   = EXCLUDED.cover_image_url,
  raw               = EXCLUDED.raw,
  last_seen_at      = now();
