import React, { Component } from 'react';

interface AboutProps {
    data: any
}

class About extends Component<AboutProps, {}> {
  render() {

  const profilePicture = "images/"+this.props.data.image;
  const bio = this.props.data.bio;
  const phone= this.props.data.phone;
  const email = this.props.data.email;
  const resumeDownload = this.props.data.resumedownload;

    return (
      <section id="about">
      <div className="row">
         <div className="three columns">
            <img className="profile-pic"  src={profilePicture} alt="Brian Handy Profile Pic" />
         </div>
         <div className="nine columns main-col">
            <h2>About Me</h2>

            <p>{bio}</p>
            <div className="row">
               <div className="columns contact-details">
                  <h2>Contact Details</h2>
                  <p className="address">
						   <span>{phone}</span><br />
                     <span>{email}</span>
					   </p>
               </div>
               <div className="columns download">
                  <p>
                     <a href={resumeDownload} className="button"><i className="fa fa-download"></i>Download Resume</a>
                  </p>
               </div>
            </div>
         </div>
      </div>

   </section>
    );
  }
}

export default About;
