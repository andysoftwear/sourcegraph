import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
// import { Link } from 'react-router-dom'
import { Subject, Subscription } from 'rxjs'
import { catchError, filter, mergeMap, tap } from 'rxjs/operators'
import { PasswordInput } from '../../../auth/SignInSignUpCommon'
import { Form } from '../../../../../branded/src/components/Form'
import { PageTitle } from '../../../components/PageTitle'
import { eventLogger } from '../../../tracking/eventLogger'
import { updatePassword } from '../backend'
import { ErrorAlert } from '../../../components/alerts'
import * as H from 'history'
import { AuthenticatedUser } from '../../../auth'
import { UserAreaUserFields, ExternalServiceKind } from '../../../graphql-operations'
import { ExternalAccountsSignIn } from './ExternalAccountsSignIn'
import { Link } from '../../../../../shared/src/components/Link'
import { SourcegraphContext } from '../../../jscontext'

interface Props extends RouteComponentProps<{}> {
    user: UserAreaUserFields
    authenticatedUser: AuthenticatedUser
    history: H.History
    context: Pick<SourcegraphContext, 'authProviders' | 'sourcegraphDotComMode'>
}

interface State {
    error?: Error
    loading?: boolean
    saved?: boolean
    showPasswordsForm: boolean
    oldPassword: string
    newPassword: string
    newPasswordConfirmation: string
}

export class UserSettingsPasswordPage extends React.Component<Props, State> {
    public state: State = {
        showPasswordsForm: false,
        oldPassword: '',
        newPassword: '',
        newPasswordConfirmation: '',
    }

    private submits = new Subject<React.FormEvent<HTMLFormElement>>()
    private subscriptions = new Subscription()

    private newPasswordConfirmationField: HTMLInputElement | null = null
    private setNewPasswordConfirmationField = (element: HTMLInputElement | null): void => {
        this.newPasswordConfirmationField = element
    }

    public componentDidMount(): void {
        eventLogger.logViewEvent('UserSettingsPassword')
        this.subscriptions.add(
            this.submits
                .pipe(
                    tap(event => {
                        event.preventDefault()
                        eventLogger.log('UpdatePasswordClicked')
                    }),
                    filter(event => event.currentTarget.checkValidity()),
                    tap(() => this.setState({ loading: true })),
                    mergeMap(() =>
                        updatePassword({
                            oldPassword: this.state.oldPassword,
                            newPassword: this.state.newPassword,
                        }).pipe(
                            // Sign the user out after their password is changed.
                            // We do this because the backend will no longer accept their current session
                            // and failing to sign them out will leave them in a confusing state
                            tap(() => (window.location.href = '/-/sign-out')),
                            catchError(error => this.handleError(error))
                        )
                    )
                )
                .subscribe(
                    () =>
                        this.setState({
                            loading: false,
                            error: undefined,
                            oldPassword: '',
                            newPassword: '',
                            newPasswordConfirmation: '',
                            saved: true,
                        }),
                    error => this.handleError(error)
                )
        )
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        return (
            <div className="user-settings-password-page">
                <PageTitle title="Account security" />
                <div className="alert alert-warning" role="alert">
                    Sign in connection for GitHub removed. Please set a new password for your account.
                </div>
                <h2 className="mb-4">Account security</h2>
                <h3>Sign in connections</h3>
                <span className="text-muted">
                    Connect your account on Sourcegraph with a third-party login service to make signing in easier. This
                    will be used to sign in to Sourcegraph in the future.
                </span>

                <ExternalAccountsSignIn
                    userID={this.props.user.id}
                    kinds={[ExternalServiceKind.GITHUB, ExternalServiceKind.GITLAB]}
                    authProviders={this.props.context.authProviders}
                    onDidError={console.log}
                    onNoAccountsFetched={this.onNoAccountsFetched()}
                />

                {this.props.authenticatedUser.id !== this.props.user.id && (
                    <div className="alert alert-danger">
                        Only the user may change their password. Site admins may{' '}
                        <Link to={`/site-admin/users?query=${encodeURIComponent(this.props.user.username)}`}>
                            reset a user's password
                        </Link>
                        .
                    </div>
                )}

                {this.state.showPasswordsForm && (
                    <>
                        <hr className="my-4" />
                        {this.state.error && (
                            <ErrorAlert className="mb-3" error={this.state.error} history={this.props.history} />
                        )}
                        {this.state.saved && <div className="alert alert-success mb-3">Password changed!</div>}
                        <Form className="mt-3 w-50" onSubmit={this.handleSubmit}>
                            {/* Include a username field as a hint for password managers to update the saved password. */}
                            <input
                                type="text"
                                value={this.props.user.username}
                                name="username"
                                autoComplete="username"
                                readOnly={true}
                                hidden={true}
                            />
                            <div className="form-group">
                                <label>Old password</label>
                                <PasswordInput
                                    value={this.state.oldPassword}
                                    onChange={this.onOldPasswordFieldChange}
                                    disabled={this.state.loading}
                                    name="oldPassword"
                                    placeholder=" "
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="form-group">
                                <label>New password</label>
                                <PasswordInput
                                    value={this.state.newPassword}
                                    onChange={this.onNewPasswordFieldChange}
                                    disabled={this.state.loading}
                                    name="newPassword"
                                    placeholder=" "
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="form-group">
                                <label>Confirm new password</label>
                                <PasswordInput
                                    value={this.state.newPasswordConfirmation}
                                    onChange={this.onNewPasswordConfirmationFieldChange}
                                    disabled={this.state.loading}
                                    name="newPasswordConfirmation"
                                    placeholder=" "
                                    inputRef={this.setNewPasswordConfirmationField}
                                    autoComplete="new-password"
                                />
                            </div>
                            <button
                                className="btn btn-primary user-settings-password-page__button"
                                type="submit"
                                disabled={this.state.loading}
                            >
                                Update password
                            </button>
                            {this.state.loading && (
                                <div className="icon-inline">
                                    <LoadingSpinner className="icon-inline" />
                                </div>
                            )}
                        </Form>
                    </>
                )}
            </div>
        )
    }

    private onOldPasswordFieldChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ oldPassword: event.target.value })
    }

    private onNewPasswordFieldChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ newPassword: event.target.value }, () => this.validateForm())
    }

    private onNoAccountsFetched = () => (show: boolean): void => {this.setState({ showPasswordsForm: show })}

    private onNewPasswordConfirmationFieldChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ newPasswordConfirmation: event.target.value }, () => this.validateForm())
    }

    private validateForm(): void {
        if (this.newPasswordConfirmationField) {
            if (this.state.newPassword === this.state.newPasswordConfirmation) {
                this.newPasswordConfirmationField.setCustomValidity('') // valid
            } else {
                this.newPasswordConfirmationField.setCustomValidity("New passwords don't match.")
            }
        }
    }

    private handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
        this.submits.next(event)
    }

    private handleError = (error: Error): [] => {
        console.error(error)
        this.setState({ loading: false, saved: false, error })
        return []
    }
}
