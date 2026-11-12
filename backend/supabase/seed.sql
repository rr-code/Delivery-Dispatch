-- Seed data (Chennai area, edit coordinates for your own city). Run AFTER schema.sql.

insert into drivers (name, phone, vehicle_type, capacity_kg, max_active_orders, rating) values
  ('Arun Kumar', '9000000001', 'bike',    15,  3, 4.7),
  ('Priya S',    '9000000002', 'scooter', 25,  3, 4.8),
  ('Karthik R',  '9000000003', 'car',     120, 4, 4.5),
  ('Meena L',    '9000000004', 'bike',    15,  2, 4.6),
  ('Suresh V',   '9000000005', 'van',     500, 5, 4.4),
  ('Divya M',    '9000000006', 'scooter', 25,  3, 4.9);

insert into driver_locations (driver_id, lat, lng)
select d.id, v.lat, v.lng
from drivers d
join (values
  ('Arun Kumar', 13.0418, 80.2341),
  ('Priya S',    13.0067, 80.2206),
  ('Karthik R',  13.0850, 80.2101),
  ('Meena L',    12.9815, 80.2180),
  ('Suresh V',   13.0382, 80.1565),
  ('Divya M',    13.0368, 80.2676)
) as v(name, lat, lng) on v.name = d.name;

insert into orders (customer_name, customer_phone, pickup_address, pickup_lat, pickup_lng,
                    drop_address, drop_lat, drop_lng, weight_kg, priority, time_window_end) values
  ('Ravi',   '9111111111', 'T. Nagar Market, Chennai',      13.0418, 80.2341, 'Adyar, Chennai',          13.0067, 80.2575, 2,   'normal', null),
  ('Sneha',  '9111111112', 'Guindy Industrial Estate',      13.0067, 80.2206, 'Velachery, Chennai',      12.9815, 80.2180, 5,   'urgent', now() + interval '1 hour'),
  ('Imran',  '9111111113', 'Anna Nagar West, Chennai',      13.0850, 80.2101, 'Kilpauk, Chennai',        13.0836, 80.2425, 1,   'normal', null),
  ('Lakshmi','9111111114', 'Tambaram Railway Station',      12.9249, 80.1000, 'Chromepet, Chennai',      12.9516, 80.1462, 30,  'normal', null),
  ('Vijay',  '9111111115', 'Mylapore, Chennai',             13.0368, 80.2676, 'Besant Nagar, Chennai',   13.0002, 80.2668, 3,   'urgent', now() + interval '45 minutes'),
  ('Anita',  '9111111116', 'Porur, Chennai',                13.0382, 80.1565, 'Vadapalani, Chennai',     13.0500, 80.2121, 200, 'normal', null);
