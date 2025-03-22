import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  Divider, 
  CircularProgress 
} from '@mui/material';
import { 
  People as PeopleIcon, 
  VoiceChat as VoiceChatIcon, 
  EmojiEvents as EmojiEventsIcon, 
  Campaign as CampaignIcon
} from '@mui/icons-material';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Stat card component
const StatCard = ({ title, value, icon, color }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h4" component="div" sx={{ mt: 1 }}>
            {value}
          </Typography>
        </Box>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: `${color}.light`, 
            borderRadius: '50%', 
            p: 1.5 
          }}
        >
          {React.cloneElement(icon, { sx: { color: `${color}.main` } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [activityData, setActivityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Get dashboard stats
        const statsRes = await axios.get('/api/dashboard/stats', { withCredentials: true });
        setStats(statsRes.data);
        
        // Get activity data for chart
        const activityRes = await axios.get('/api/dashboard/activity', { withCredentials: true });
        setActivityData(activityRes.data);
        
        setError(null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const renderActivityChart = () => {
    if (!activityData) return null;

    const chartData = {
      labels: activityData.dates,
      datasets: [
        {
          label: 'Voice Rooms Created',
          data: activityData.roomsCreated,
          borderColor: '#5865F2',
          backgroundColor: 'rgba(88, 101, 242, 0.2)',
          tension: 0.3,
        },
        {
          label: 'Active Users',
          data: activityData.activeUsers,
          borderColor: '#57F287',
          backgroundColor: 'rgba(87, 242, 135, 0.2)',
          tension: 0.3,
        }
      ]
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    };

    return (
      <Box sx={{ height: 300, p: 1 }}>
        <Line data={chartData} options={options} />
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="error" variant="h6">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Welcome to the Discord Room Bot admin dashboard. Here's an overview of your server's activity.
      </Typography>
      
      {stats && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="Total Users" 
              value={stats.totalUsers} 
              icon={<PeopleIcon />} 
              color="primary" 
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="Active Rooms" 
              value={stats.activeRooms} 
              icon={<VoiceChatIcon />} 
              color="secondary" 
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="Top Level" 
              value={stats.topLevel} 
              icon={<EmojiEventsIcon />} 
              color="warning" 
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="Total Commands" 
              value={stats.totalCommands} 
              icon={<CampaignIcon />} 
              color="info" 
            />
          </Grid>
        </Grid>
      )}
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Server Activity
        </Typography>
        <Divider sx={{ mb: 3 }} />
        {renderActivityChart()}
      </Paper>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Rooms
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {stats && stats.recentRooms.map((room, index) => (
              <Box key={room.id || index} sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  {room.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Created by {room.owner} • {room.createdAt}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Top Users by Activity
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {stats && stats.topUsers.map((user, index) => (
              <Box key={user.id || index} sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  {user.username}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Level {user.level} • {user.totalTime} in voice
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;