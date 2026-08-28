package service

import "testing"

func TestNormalizeAPIPermissionsMigratesCreationTaskPermissions(t *testing.T) {
	permissions := NormalizeAPIPermissions([]string{
		APIPermissionKey("GET", "/api/image-tasks"),
		"POST /api/image-tasks",
	})

	if !HasAPIPermission(PermissionSet{APIPermissions: permissions}, "GET", "/api/creation-tasks") {
		t.Fatalf("migrated permissions missing creation task read: %#v", permissions)
	}
	if !HasAPIPermission(PermissionSet{APIPermissions: permissions}, "POST", "/api/creation-tasks/chat-completions") {
		t.Fatalf("migrated permissions missing creation task submit subtree: %#v", permissions)
	}
	if HasAPIPermission(PermissionSet{APIPermissions: permissions}, "GET", "/api/image-tasks") {
		t.Fatalf("old image task route should not be authorized: %#v", permissions)
	}
}

func TestAPIPermissionsAccountPoolAreExplicit(t *testing.T) {
	readOnly := PermissionSet{APIPermissions: []string{APIPermissionKey("GET", "/api/accounts")}}
	if !HasAPIPermission(readOnly, "GET", "/api/accounts") {
		t.Fatalf("read-only account permission missing account list")
	}
	if HasAPIPermission(readOnly, "GET", "/api/accounts/tokens") {
		t.Fatalf("account list permission should not allow token export")
	}
	if HasAPIPermission(readOnly, "POST", "/api/accounts/refresh") {
		t.Fatalf("account list permission should not allow refresh")
	}
	if HasAPIPermission(readOnly, "POST", "/api/accounts/upstream-actions") {
		t.Fatalf("account list permission should not allow upstream actions")
	}
	if HasAPIPermission(readOnly, "POST", "/api/accounts/toggle-enabled") {
		t.Fatalf("account list permission should not allow toggling enabled state")
	}

	operators := PermissionSet{APIPermissions: NormalizeAPIPermissions([]string{
		APIPermissionKey("GET", "/api/accounts/tokens"),
		APIPermissionKey("POST", "/api/accounts"),
		APIPermissionKey("POST", "/api/accounts/session"),
		APIPermissionKey("POST", "/api/accounts/refresh"),
		APIPermissionKey("POST", "/api/accounts/upstream-actions"),
		APIPermissionKey("POST", "/api/accounts/update"),
		APIPermissionKey("POST", "/api/accounts/toggle-enabled"),
		APIPermissionKey("DELETE", "/api/accounts"),
	})}
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/accounts/tokens"},
		{"POST", "/api/accounts"},
		{"POST", "/api/accounts/session"},
		{"POST", "/api/accounts/refresh"},
		{"POST", "/api/accounts/upstream-actions"},
		{"POST", "/api/accounts/update"},
		{"POST", "/api/accounts/toggle-enabled"},
		{"DELETE", "/api/accounts"},
	} {
		if !HasAPIPermission(operators, tc.method, tc.path) {
			t.Fatalf("missing explicit permission for %s %s in %#v", tc.method, tc.path, operators.APIPermissions)
		}
	}
}

func TestCanvasPermissionsAreExplicit(t *testing.T) {
	permissions := NormalizeAPIPermissions([]string{
		APIPermissionKey("GET", "/api/canvases"),
		APIPermissionKey("POST", "/api/canvases"),
		APIPermissionKey("DELETE", "/api/canvases"),
		APIPermissionKey("GET", "/api/canvas/models"),
		APIPermissionKey("GET", "/api/canvas-runs"),
		APIPermissionKey("POST", "/api/canvas-runs"),
	})
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/canvases"},
		{"POST", "/api/canvases/abc"},
		{"DELETE", "/api/canvases/abc"},
		{"GET", "/api/canvas/models"},
		{"GET", "/api/canvas-runs"},
		{"POST", "/api/canvas-runs/abc/cancel"},
	} {
		if !HasAPIPermission(PermissionSet{APIPermissions: permissions}, tc.method, tc.path) {
			t.Fatalf("missing explicit canvas permission for %s %s in %#v", tc.method, tc.path, permissions)
		}
	}
}

func TestBeadProjectPermissionsAreDefaultAndExplicit(t *testing.T) {
	defaults := DefaultPermissionSetForRole(AuthRoleUser)
	if !containsString(defaults.MenuPaths, "/beads") {
		t.Fatalf("default user menu paths missing /beads: %#v", defaults.MenuPaths)
	}
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/bead-projects"},
		{"POST", "/api/bead-projects"},
		{"GET", "/api/bead-projects/project-1"},
		{"POST", "/api/bead-projects/project-1/copies"},
		{"PUT", "/api/bead-projects/project-1"},
		{"PATCH", "/api/bead-projects/project-1"},
		{"DELETE", "/api/bead-projects/project-1"},
	} {
		if !HasAPIPermission(defaults, tc.method, tc.path) {
			t.Fatalf("missing default bead permission for %s %s in %#v", tc.method, tc.path, defaults.APIPermissions)
		}
	}
	readOnly := PermissionSet{APIPermissions: []string{APIPermissionKey("GET", "/api/bead-projects")}}
	if !HasAPIPermission(readOnly, "GET", "/api/bead-projects/project-1") {
		t.Fatal("read-only bead permission should allow project detail")
	}
	if HasAPIPermission(readOnly, "PUT", "/api/bead-projects/project-1") {
		t.Fatal("read-only bead permission should not allow project save")
	}
}

func TestSocialPermissionsAreDefaultAndExplicit(t *testing.T) {
	defaults := DefaultPermissionSetForRole(AuthRoleUser)
	if !containsString(defaults.MenuPaths, "/social") {
		t.Fatalf("default user menu paths missing /social: %#v", defaults.MenuPaths)
	}
	if !containsString(defaults.MenuPaths, "/ecommerce-suite") {
		t.Fatalf("default user menu paths missing /ecommerce-suite: %#v", defaults.MenuPaths)
	}
	if !containsString(defaults.MenuPaths, "/image-manager") {
		t.Fatalf("default user menu paths missing /image-manager: %#v", defaults.MenuPaths)
	}
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/social-projects"},
		{"POST", "/api/social-projects"},
		{"GET", "/api/social-projects/project-1"},
		{"POST", "/api/social-projects/project-1/generate-copy"},
		{"POST", "/api/social-projects/project-1/generate-cards"},
		{"POST", "/api/social-projects/project-1/export"},
		{"DELETE", "/api/social-projects/project-1"},
	} {
		if !HasAPIPermission(defaults, tc.method, tc.path) {
			t.Fatalf("missing default social permission for %s %s in %#v", tc.method, tc.path, defaults.APIPermissions)
		}
	}

	readOnly := PermissionSet{APIPermissions: []string{APIPermissionKey("GET", "/api/social-projects")}}
	if !HasAPIPermission(readOnly, "GET", "/api/social-projects/project-1") {
		t.Fatalf("read-only social permission should allow project detail")
	}
	if HasAPIPermission(readOnly, "POST", "/api/social-projects/project-1") {
		t.Fatalf("read-only social permission should not allow project mutation")
	}
}

func TestImageTagPermissionsAreDefaultAndExplicit(t *testing.T) {
	defaults := DefaultPermissionSetForRole(AuthRoleUser)
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/images/tags"},
		{"PATCH", "/api/images/tags"},
		{"POST", "/api/images/tags"},
		{"DELETE", "/api/images/tags"},
	} {
		if !HasAPIPermission(defaults, tc.method, tc.path) {
			t.Fatalf("missing default image tag permission for %s %s in %#v", tc.method, tc.path, defaults.APIPermissions)
		}
	}
}

func TestAssetCollectionPermissionsAreDefaultAndSubtree(t *testing.T) {
	defaults := DefaultPermissionSetForRole(AuthRoleUser)
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/text-assets"},
		{"POST", "/api/text-assets"},
		{"PATCH", "/api/text-assets/ta_123"},
		{"DELETE", "/api/text-assets/ta_123"},
		{"GET", "/api/text-asset-collections"},
		{"POST", "/api/text-asset-collections"},
		{"PATCH", "/api/text-asset-collections/items"},
		{"DELETE", "/api/text-asset-collections/tcol_123"},
		{"GET", "/api/video-asset-collections"},
		{"POST", "/api/video-asset-collections"},
		{"PATCH", "/api/video-asset-collections/items"},
		{"DELETE", "/api/video-asset-collections/vcol_123"},
	} {
		if !HasAPIPermission(defaults, tc.method, tc.path) {
			t.Fatalf("missing default asset collection permission for %s %s in %#v", tc.method, tc.path, defaults.APIPermissions)
		}
	}
}

func TestMergeDefaultManagedRoleAddsAssetCollectionPermissions(t *testing.T) {
	roles := mergeDefaultManagedRole([]ManagedRole{{
		ID:             DefaultManagedRoleID,
		Name:           "普通用户",
		Builtin:        true,
		MenuPaths:      []string{"/social"},
		APIPermissions: []string{APIPermissionKey("GET", "/api/social-projects")},
	}})
	if len(roles) != 1 {
		t.Fatalf("roles = %#v", roles)
	}
	permissions := PermissionSet{MenuPaths: roles[0].MenuPaths, APIPermissions: roles[0].APIPermissions}
	for _, tc := range []struct {
		method string
		path   string
	}{
		{"GET", "/api/text-assets"},
		{"POST", "/api/text-assets"},
		{"PATCH", "/api/text-assets/ta_123"},
		{"DELETE", "/api/text-assets/ta_123"},
		{"GET", "/api/text-asset-collections"},
		{"POST", "/api/text-asset-collections"},
		{"PATCH", "/api/text-asset-collections/items"},
		{"DELETE", "/api/text-asset-collections/tcol_123"},
		{"GET", "/api/video-asset-collections"},
		{"POST", "/api/video-asset-collections"},
		{"PATCH", "/api/video-asset-collections/items"},
		{"DELETE", "/api/video-asset-collections/vcol_123"},
	} {
		if !HasAPIPermission(permissions, tc.method, tc.path) {
			t.Fatalf("merged default role missing asset collection permission for %s %s in %#v", tc.method, tc.path, roles[0].APIPermissions)
		}
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
