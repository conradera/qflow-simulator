-- Enable Supabase Realtime for live queue updates
ALTER PUBLICATION supabase_realtime ADD TABLE patients;
ALTER PUBLICATION supabase_realtime ADD TABLE service_points;
ALTER PUBLICATION supabase_realtime ADD TABLE queue_events;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
