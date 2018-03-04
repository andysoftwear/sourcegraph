package graphqlbackend

import (
	"context"
	"errors"
	"time"

	graphql "github.com/neelance/graphql-go"
	"github.com/neelance/graphql-go/relay"
	"sourcegraph.com/sourcegraph/sourcegraph/cmd/frontend/internal/db"
	"sourcegraph.com/sourcegraph/sourcegraph/cmd/frontend/internal/pkg/types"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/api"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/errcode"
)

// userResolver resolves a Sourcegraph user.
type userResolver struct {
	user *types.User
}

func userByID(ctx context.Context, id graphql.ID) (*userResolver, error) {
	userID, err := unmarshalUserID(id)
	if err != nil {
		return nil, err
	}
	return userByIDInt32(ctx, userID)
}

func userByIDInt32(ctx context.Context, id int32) (*userResolver, error) {
	user, err := db.Users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &userResolver{user: user}, nil
}

func (r *userResolver) ID() graphql.ID { return marshalUserID(r.user.ID) }

func marshalUserID(id int32) graphql.ID { return relay.MarshalID("User", id) }

func unmarshalUserID(id graphql.ID) (userID int32, err error) {
	err = relay.UnmarshalSpec(id, &userID)
	return
}

func (r *userResolver) ExternalID() *string { return r.user.ExternalID }

func (r *userResolver) AuthID() string {
	id := r.ExternalID()
	if id == nil {
		return ""
	}
	return *id
}

func (r *userResolver) Auth0ID() string {
	id := r.ExternalID()
	if id == nil {
		return ""
	}
	return *id
}

func (r *userResolver) SourcegraphID() int32 { return r.user.ID }

func (r *userResolver) Email(ctx context.Context) (string, error) {
	email, _, err := db.UserEmails.GetEmail(ctx, r.user.ID)
	if err != nil {
		return "", err
	}

	return email, nil
}

func (r *userResolver) Username() string { return r.user.Username }

func (r *userResolver) DisplayName() *string { return &r.user.DisplayName }

func (r *userResolver) AvatarURL() *string { return r.user.AvatarURL }

func (r *userResolver) CreatedAt() string {
	return r.user.CreatedAt.Format(time.RFC3339)
}

func (r *userResolver) UpdatedAt() *string {
	t := r.user.CreatedAt.Format(time.RFC3339) // ISO
	return &t
}

func (r *userResolver) LatestSettings(ctx context.Context) (*settingsResolver, error) {
	settings, err := db.Settings.GetLatest(ctx, api.ConfigurationSubject{User: &r.user.ID})
	if err != nil {
		return nil, err
	}
	if settings == nil {
		return nil, nil
	}
	return &settingsResolver{&configurationSubject{user: r}, settings, nil}, nil
}

func (r *userResolver) Verified(ctx context.Context) (bool, error) {
	_, verified, err := db.UserEmails.GetEmail(ctx, r.user.ID)
	if err != nil {
		return false, err
	}

	return verified, nil
}

func (r *userResolver) SiteAdmin() bool { return r.user.SiteAdmin }

func (*schemaResolver) UpdateUser(ctx context.Context, args *struct {
	Username    *string
	DisplayName *string
	AvatarURL   *string
}) (*userResolver, error) {
	user, err := db.Users.GetByCurrentAuthUser(ctx)
	if err != nil {
		return nil, err
	}

	updatedUser, err := db.Users.Update(ctx, user.ID, args.Username, args.DisplayName, args.AvatarURL)
	if err != nil {
		return nil, err
	}

	return &userResolver{user: updatedUser}, nil
}

func currentUser(ctx context.Context) (*userResolver, error) {
	user, err := db.Users.GetByCurrentAuthUser(ctx)
	if err != nil {
		if errcode.IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	return &userResolver{user: user}, nil
}

func (r *userResolver) Orgs(ctx context.Context) ([]*orgResolver, error) {
	orgs, err := db.Orgs.GetByUserID(ctx, r.user.ID)
	if err != nil {
		return nil, err
	}
	orgResolvers := []*orgResolver{}
	for _, org := range orgs {
		orgResolvers = append(orgResolvers, &orgResolver{org})
	}
	return orgResolvers, nil
}

func (r *userResolver) OrgMemberships(ctx context.Context) ([]*orgMemberResolver, error) {
	members, err := db.OrgMembers.GetByUserID(ctx, r.user.ID)
	if err != nil {
		return nil, err
	}
	orgMemberResolvers := []*orgMemberResolver{}
	for _, member := range members {
		orgMemberResolvers = append(orgMemberResolvers, &orgMemberResolver{nil, member, nil})
	}
	return orgMemberResolvers, nil
}

func (r *userResolver) Tags(ctx context.Context) ([]*userTagResolver, error) {
	tags, err := db.UserTags.GetByUserID(ctx, r.user.ID)
	if err != nil {
		return nil, err
	}
	userTagResolvers := []*userTagResolver{}
	for _, tag := range tags {
		userTagResolvers = append(userTagResolvers, &userTagResolver{tag})
	}
	return userTagResolvers, nil
}

func (r *schemaResolver) UpdatePassword(ctx context.Context, args *struct {
	OldPassword string
	NewPassword string
}) (*EmptyResponse, error) {
	// 🚨 SECURITY: A user can only change their own password.
	user, err := db.Users.GetByCurrentAuthUser(ctx)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("no authenticated user")
	}

	if err := db.Users.UpdatePassword(ctx, user.ID, args.OldPassword, args.NewPassword); err != nil {
		return nil, err
	}
	return &EmptyResponse{}, nil
}
