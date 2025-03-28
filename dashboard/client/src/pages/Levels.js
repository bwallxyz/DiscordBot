// Updated Levels.js with fixed data loading and error handling
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import axios from 'axios';

const Levels = () => {
  const [settings, setSettings] = useState(null);
  const [levelRoles, setLevelRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [editedSettings, setEditedSettings] = useState({});
  const [openRoleDialog, setOpenRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState({ level: '', roleId: '', roleName: '' });
  const [serverRoles, setServerRoles] = useState({ roles: [], channels: [] });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Fetch level settings with error handling and retries
  const fetchLevelSettings = async (retryCount = 0) => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await axios.get('/api/levels/settings', { 
        withCredentials: true,
        timeout: 10000 // 10 second timeout
      });
      
      if (res.data && res.data.settings) {
        console.log('Level settings loaded:', res.data);
        setSettings(res.data.settings);
        setLevelRoles(res.data.levelRoles || []);
        setServerRoles({
          roles: res.data.serverRoles?.roles || [],
          channels: res.data.serverRoles?.channels || []
        });
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (err) {
      console.error('Error fetching level settings:', err);
      
      // Retry logic (max 3 retries)
      if (retryCount < 3) {
        console.log(`Retrying fetch (attempt ${retryCount + 1})...`);
        setTimeout(() => fetchLevelSettings(retryCount + 1), 1000);
        return;
      }
      
      setError(err.response?.data?.message || err.message || 'Failed to load level settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevelSettings();
  }, []);

  const showSnackbar = (message, severity = 'success') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // Start editing settings
  const handleEditSettings = () => {
    // Ensure settings exist before starting edit
    if (!settings || !settings.xpSettings) {
      showSnackbar('Cannot edit settings: data not loaded correctly', 'error');
      return;
    }
    
    setEditedSettings({
      voiceXpPerMinute: settings.xpSettings.voiceXpPerMinute,
      messageXpPerMessage: settings.xpSettings.messageXpPerMessage,
      messageXpCooldown: settings.xpSettings.messageXpCooldown,
      notificationChannelId: settings.notifications?.channelId || '',
      dmNotifications: settings.notifications?.dmUser,
      channelNotifications: settings.notifications?.announceInChannel
    });
    setEditingSettings(true);
  };

  // Save edited settings
  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      
      // Validate settings before sending
      if (editedSettings.voiceXpPerMinute <= 0 || editedSettings.messageXpPerMessage <= 0) {
        showSnackbar('XP values must be greater than 0', 'error');
        setLoading(false);
        return;
      }
      
      const res = await axios.put('/api/levels/settings', editedSettings, { 
        withCredentials: true 
      });
      
      if (res.data && res.data.success) {
        await fetchLevelSettings();
        setEditingSettings(false);
        showSnackbar('Settings saved successfully');
      } else {
        throw new Error(res.data?.message || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      showSnackbar('Failed to save settings: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingSettings(false);
  };

  // Handle settings change
  const handleSettingChange = (setting, value) => {
    setEditedSettings({
      ...editedSettings,
      [setting]: value
    });
  };

  // Open add role dialog
  const handleAddRole = () => {
    // Ensure server roles are loaded
    if (!serverRoles.roles || serverRoles.roles.length === 0) {
      showSnackbar('Server roles not loaded correctly', 'error');
      return;
    }
    
    setNewRole({ level: '', roleId: '', roleName: '' });
    setOpenRoleDialog(true);
  };

  // Close role dialog
  const handleCloseRoleDialog = () => {
    setOpenRoleDialog(false);
  };

  // Save new role
  const handleSaveRole = async () => {
    if (!newRole.level || !newRole.roleId) {
      showSnackbar('Level and role are required', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post('/api/levels/roles', {
        level: newRole.level,
        roleId: newRole.roleId
      }, { withCredentials: true });

      if (res.data && res.data.success) {
        await fetchLevelSettings();
        setOpenRoleDialog(false);
        showSnackbar('Level role added successfully');
      } else {
        throw new Error(res.data?.message || 'Failed to add level role');
      }
    } catch (err) {
      console.error('Error adding level role:', err);
      showSnackbar('Failed to add level role: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete level role
  const handleDeleteRole = async (level) => {
    if (window.confirm(`Are you sure you want to remove the role for level ${level}?`)) {
      try {
        setLoading(true);
        const res = await axios.delete(`/api/levels/roles/${level}`, { 
          withCredentials: true 
        });

        if (res.data && res.data.success) {
          await fetchLevelSettings();
          showSnackbar('Level role removed successfully');
        } else {
          throw new Error(res.data?.message || 'Failed to delete level role');
        }
      } catch (err) {
        console.error('Error deleting level role:', err);
        showSnackbar('Failed to delete level role: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  // Manual refresh handler
  const handleRefresh = () => {
    fetchLevelSettings();
    showSnackbar('Refreshing level data...');
  };

  if (loading && !settings) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Level System Settings
        </Typography>
        <Tooltip title="Refresh Data">
          <IconButton onClick={handleRefresh} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
          <Button 
            size="small" 
            sx={{ ml: 2 }} 
            onClick={() => fetchLevelSettings()}
          >
            Try Again
          </Button>
        </Alert>
      )}

      {settings ? (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">XP Settings</Typography>
                {!editingSettings ? (
                  <Button 
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={handleEditSettings}
                    disabled={loading}
                  >
                    Edit
                  </Button>
                ) : (
                  <Box>
                    <IconButton color="primary" onClick={handleSaveSettings} disabled={loading}>
                      <SaveIcon />
                    </IconButton>
                    <IconButton color="error" onClick={handleCancelEdit} disabled={loading}>
                      <CancelIcon />
                    </IconButton>
                  </Box>
                )}
              </Box>
              <Divider sx={{ mb: 3 }} />

              {editingSettings ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Voice XP per Minute"
                      type="number"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.voiceXpPerMinute}
                      onChange={(e) => handleSettingChange('voiceXpPerMinute', parseFloat(e.target.value))}
                      InputProps={{ inputProps: { min: 0.1, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Message XP per Message"
                      type="number"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.messageXpPerMessage}
                      onChange={(e) => handleSettingChange('messageXpPerMessage', parseFloat(e.target.value))}
                      InputProps={{ inputProps: { min: 0.1, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Message Cooldown (seconds)"
                      type="number"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.messageXpCooldown}
                      onChange={(e) => handleSettingChange('messageXpCooldown', parseInt(e.target.value))}
                      InputProps={{ inputProps: { min: 10, step: 1 } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      select
                      label="Notification Channel"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.notificationChannelId || ''}
                      onChange={(e) => handleSettingChange('notificationChannelId', e.target.value)}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {serverRoles.channels.map((channel) => (
                        <MenuItem key={channel.id} value={channel.id}>
                          {channel.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="DM Notifications"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.dmNotifications ? 'true' : 'false'}
                      onChange={(e) => handleSettingChange('dmNotifications', e.target.value === 'true')}
                    >
                      <MenuItem value="true">Enabled</MenuItem>
                      <MenuItem value="false">Disabled</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="Channel Announcements"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.channelNotifications ? 'true' : 'false'}
                      onChange={(e) => handleSettingChange('channelNotifications', e.target.value === 'true')}
                    >
                      <MenuItem value="true">Enabled</MenuItem>
                      <MenuItem value="false">Disabled</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              ) : (
                <Box>
                  {settings.xpSettings ? (
                    <>
                      <Typography variant="body1" gutterBottom>
                        <strong>Voice XP:</strong> {settings.xpSettings.voiceXpPerMinute} XP per minute
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        <strong>Message XP:</strong> {settings.xpSettings.messageXpPerMessage} XP per message
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        <strong>Message Cooldown:</strong> {settings.xpSettings.messageXpCooldown} seconds
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        <strong>Base XP for Level 1:</strong> {settings.xpSettings.baseMultiplier} XP
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        <strong>XP Scaling Factor:</strong> {settings.xpSettings.scalingMultiplier}x
                      </Typography>
                    </>
                  ) : (
                    <Typography color="error">XP settings not loaded correctly</Typography>
                  )}
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle1" gutterBottom>
                    Notification Settings
                  </Typography>
                  
                  {settings.notifications ? (
                    <>
                      <Typography variant="body1" gutterBottom>
                        <strong>Notifications:</strong> {settings.notifications.enabled ? 'Enabled' : 'Disabled'}
                      </Typography>
                      
                      {settings.notifications.channelId && (
                        <Typography variant="body1" gutterBottom>
                          <strong>Notification Channel:</strong> {settings.notificationChannelName || settings.notifications.channelId}
                        </Typography>
                      )}
                      
                      <Typography variant="body1" gutterBottom>
                        <strong>DM Notifications:</strong> {settings.notifications.dmUser ? 'Enabled' : 'Disabled'}
                      </Typography>
                      
                      <Typography variant="body1" gutterBottom>
                        <strong>Channel Announcements:</strong> {settings.notifications.announceInChannel ? 'Enabled' : 'Disabled'}
                      </Typography>
                    </>
                  ) : (
                    <Typography color="error">Notification settings not loaded correctly</Typography>
                  )}
                </Box>
              )}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Level Roles</Typography>
                <Button 
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddRole}
                  disabled={loading || !(serverRoles.roles && serverRoles.roles.length > 0)}
                >
                  Add Role
                </Button>
              </Box>
              <Divider sx={{ mb: 3 }} />
              
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Level</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {levelRoles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          No level roles configured
                        </TableCell>
                      </TableRow>
                    ) : (
                      levelRoles.map((role) => (
                        <TableRow key={role.level}>
                          <TableCell>{role.level}</TableCell>
                          <TableCell>{role.roleName}</TableCell>
                          <TableCell align="center">
                            <Tooltip title="Delete Role">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteRole(role.level)}
                                disabled={loading}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      ) : (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Level system data could not be loaded. Please refresh the page.
        </Alert>
      )}

      {/* Add Role Dialog */}
      <Dialog open={openRoleDialog} onClose={handleCloseRoleDialog}>
        <DialogTitle>Add Level Role</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Level"
                type="number"
                fullWidth
                value={newRole.level}
                onChange={(e) => setNewRole({ ...newRole, level: e.target.value })}
                InputProps={{ inputProps: { min: 1 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                label="Role"
                fullWidth
                value={newRole.roleId}
                onChange={(e) => {
                  const selectedRole = serverRoles.roles.find(r => r.id === e.target.value);
                  setNewRole({ 
                    ...newRole, 
                    roleId: e.target.value,
                    roleName: selectedRole ? selectedRole.name : ''
                  });
                }}
              >
                {serverRoles.roles.map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    {role.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRoleDialog}>Cancel</Button>
          <Button 
            onClick={handleSaveRole} 
            variant="contained" 
            color="primary" 
            disabled={loading}
          >
            Add Role
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Levels;