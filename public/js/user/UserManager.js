// user/UserManager.js

class UserManager {
  static instance = null;

  constructor() {
    if (UserManager.instance) {
      return UserManager.instance;
    }
    
    UserManager.instance = this;
  }

  static getInstance() {
    if (!UserManager.instance) {
      UserManager.instance = new UserManager();
    }
    return UserManager.instance;
  }
  
  async refreshUserData() {
    try {
      const userData = await this.getUserData();
      if (userData) {
        this.initializeForm(userData);
        return userData;
      } else {
        throw new Error('Failed to fetch user data');
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
      throw error;
    }
  }

  initializeForm(userData) {
    const isAdmin = userData?.ski_center_admin === "1";
    const hasTrails = userData?.trails && Array.isArray(userData.trails) && userData.trails.length > 0;
    
    const regularUserSection = document.getElementById('regular-user-section');
    const adminSection = document.getElementById('admin-section');
    const trailsSection = document.getElementById('trails-section');

    regularUserSection.style.display = isAdmin ? 'none' : 'block';
    adminSection.style.display = isAdmin ? 'block' : 'none';
    
    trailsSection.style.display = 'none';
    if (isAdmin && hasTrails) {
      trailsSection.style.display = 'block';
      this.initializeTrailsSection(userData.trails);
    }
    
    console.log('Form initialization:', {
      isAdmin,
      hasTrails,
      trails: userData?.trails,
      trailsSectionDisplay: trailsSection?.style.display
    });
  }

  initializeTrailsSection(trails) {
    const container = document.getElementById('trails-container');
    container.innerHTML = '';
    
    trails.forEach(([trailId, trailName]) => {
      const trailElement = this.createTrailElement(trailId, trailName);
      container.appendChild(trailElement);
    });
  }

  createTrailElement(trailId, trailName) {
    // ... existing createTrailElement code ...
  }
}

export default UserManager;
