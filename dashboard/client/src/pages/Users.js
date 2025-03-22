import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  EmojiEvents as EmojiEventsIcon,
  BarChart as BarChartIcon
} from '@mui/icons-material';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [userDetailOpen, setUserDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userStats, setUserStats] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/users', {
        params: {
          page,
          limit: rowsPerPage,
          search: searchTerm
        },
        withCredentials: true
      });
      
      setUsers(res.data.users);
      setTotalUsers(res.data.total);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, rowsPerPage, searchTerm]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const handleRefresh = () => {
    fetchUsers();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  };

  const openUserDetail = async (user) => {
    setSelectedUser(user);
    
    try {
      const res = await axios.get(`/api/users/${user.userId}/stats`, { withCredentials: true });
      setUserStats(res.data);
    } catch (err) {
      console.error('Error fetching user stats:', err);
      setUserStats(null);
    }
    
    setUserDetailOpen(true);
  };

  const closeUserDetail = () => {
    setUserDetailOpen(false);
    setSelectedUser(null);
    setUserStats(null);
  };

  const renderActivityChart = () => {
    if (!userStats || !userStats.activityByDay) return null;

    const chartData = {
      labels: Object.keys(userStats.activityByDay),
      datasets: [
        {
          label: 'Voice Activity (minutes)',
          data: Object.values(userStats.activityByDay),
          backgroundColor: '#5865F2',
        }
      ]
    };

    const options = {
      responsive: true,
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
        }
      }
    };

    return (
      <Box sx={{ height: 250, mt: 2 }}>
        <Bar data={chartData} options={options} />
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Users
      </Typography>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search users..."
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" sx={{ p: 2 }}>
            {error}
          </Typography>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Level</TableCell>
                    <TableCell>Total XP</TableCell>
                    <TableCell>Voice Time</TableCell>
                    <TableCell>Last Active</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Avatar 
                              src={user.avatar ? `https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png` : undefined}
                              alt={user.username}
                              sx={{ width: 30, height: 30, mr: 1 }}
                            />
                            <Typography variant="body2">
                              {user.username}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={<EmojiEventsIcon />}
                            label={`Level ${user.level}`}
                            size="small"
                            color={user.level > 10 ? "secondary" : "primary"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{user.xp}</TableCell>
                        <TableCell>{user.formattedTime || '0 minutes'}</TableCell>
                        <TableCell>{formatDate(user.lastActive)}</TableCell>
                        <TableCell align="center">
                          <Tooltip title="View Details">
                            <IconButton 
                              size="small"
                              onClick={() => openUserDetail(user)}
                            >
                              <BarChartIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={totalUsers}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </Paper>

      {/* User Detail Dialog */}
      <Dialog
        open={userDetailOpen}
        onClose={closeUserDetail}
        maxWidth="md"
        fullWidth
      >
        {selectedUser && (
          <>
            <DialogTitle>
              User Details: {selectedUser.username}
            </DialogTitle>
            <DialogContent dividers>
              {!userStats ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                      <Avatar 
                        src={selectedUser.avatar ? `https://cdn.discordapp.com/avatars/${selectedUser.userId}/${selectedUser.avatar}.png` : undefined}
                        alt={selectedUser.username}
                        sx={{ width: 80, height: 80, mx: 'auto', mb: 2 }}
                      />
                      <Typography variant="h6">
                        {selectedUser.username}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        ID: {selectedUser.userId}
                      </Typography>
                    </Box>

                    <Typography variant="subtitle2" gutterBottom>
                      XP Information
                    </Typography>
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="body2">
                        Level: <strong>{userStats.level}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Total XP: <strong>{userStats.xp}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Voice XP: <strong>{userStats.voiceXp || 0}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Message XP: <strong>{userStats.messageXp || 0}</strong>
                      </Typography>
                    </Box>

                    <Typography variant="subtitle2" gutterBottom>
                      Activity Information
                    </Typography>
                    <Box>
                      <Typography variant="body2">
                        Total Voice Time: <strong>{userStats.formattedTime || '0 minutes'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Voice Sessions: <strong>{userStats.totalSessions || 0}</strong>
                      </Typography>
                      <Typography variant="body2">
                        First Seen: <strong>{formatDate(userStats.firstSeen)}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Last Active: <strong>{formatDate(userStats.lastActive)}</strong>
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <Typography variant="subtitle1" gutterBottom>
                      Voice Activity (Last 7 Days)
                    </Typography>
                    {renderActivityChart()}
                    
                    {userStats.currentSession && (
                      <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                        <Typography variant="subtitle2" color="success.main" gutterBottom>
                          Currently Active
                        </Typography>
                        <Typography variant="body2">
                          In channel: <strong>{userStats.currentSession.channelName}</strong>
                        </Typography>
                        <Typography variant="body2">
                          Duration: <strong>{userStats.currentSession.duration}</strong>
                        </Typography>
                        <Typography variant="body2">
                          Joined at: <strong>{formatDate(userStats.currentSession.joinedAt)}</strong>
                        </Typography>
                      </Box>
                    )}
                  </Grid>
                </Grid>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeUserDetail}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default Users;